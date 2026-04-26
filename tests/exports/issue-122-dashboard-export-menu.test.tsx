/**
 * Click-through regression test for GitHub issue #122 — proves the
 * Operations overview Export dropdown actually invokes the export
 * services (the original bug was a button with no onClick).
 *
 * The pure helpers are pinned in `issue-122-operations-overview.test.ts`;
 * this test pins the wiring: dropdown opens, menu items dispatch to the
 * mocked services with the expected shapes.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

// `vi.mock` is hoisted to the top of the file, before module-scope `const`
// declarations. `vi.hoisted` declares the spy refs in the same hoisted phase
// so the mock factories can close over them safely.
const { exportToCSV, downloadOperationsPdf } = vi.hoisted(() => ({
  exportToCSV: vi.fn(),
  downloadOperationsPdf: vi.fn(),
}))

vi.mock("@/src/infrastructure/services/exportService", () => ({
  exportService: { exportToCSV },
}))
vi.mock("@/app/dashboard/_components/dashboard-pdf", () => ({
  downloadOperationsPdf,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

// Radix DropdownMenu portals its content and gates rendering on pointer
// events, which happy-dom doesn't fully simulate. Stub the primitives to
// render children inline so menu items are queryable without driving the
// real popover open/close state.
vi.mock("@/app/components/ui/dropdown-menu", () => {
  const React = require("react") as typeof import("react")
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DropdownMenuItem: ({
      children,
      onClick,
      disabled,
    }: {
      children: React.ReactNode
      onClick?: () => void
      disabled?: boolean
    }) => (
      <button type="button" disabled={disabled} onClick={disabled ? undefined : onClick}>
        {children}
      </button>
    ),
  }
})

import { DashboardExportMenu } from "@/app/dashboard/_components/dashboard-export-menu"
import type { OperationsExportInput } from "@/app/dashboard/_components/dashboard-export-utils"

const FIXTURE: OperationsExportInput = {
  period: "week",
  periodLabel: "Apr 21 – Apr 27",
  utilPeriod: "7d",
  totalActiveRolls: 42,
  cutsThisWeek: 7,
  wastePercentage: 12.3,
  inventoryValue: 18742,
  utilization: { series: [], materials: [] },
  recentCuts: [],
}

describe("DashboardExportMenu", () => {
  beforeEach(() => {
    exportToCSV.mockClear()
    downloadOperationsPdf.mockClear()
  })

  it("renders an Export trigger that is disabled while loading", () => {
    render(<DashboardExportMenu input={FIXTURE} disabled />)
    const trigger = screen.getByRole("button", { name: /^export$/i }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
  })

  it("ignores menu item clicks when the parent prop is disabled", () => {
    render(<DashboardExportMenu input={FIXTURE} disabled />)
    fireEvent.click(screen.getByText(/export as csv/i))
    fireEvent.click(screen.getByText(/generate pdf report/i))
    expect(exportToCSV).not.toHaveBeenCalled()
    expect(downloadOperationsPdf).not.toHaveBeenCalled()
  })

  it("dispatches CSV export with a period-scoped filename when 'Export as CSV' is clicked", () => {
    render(<DashboardExportMenu input={FIXTURE} />)
    fireEvent.click(screen.getByText(/export as csv/i))

    expect(exportToCSV).toHaveBeenCalledTimes(1)
    const arg = exportToCSV.mock.calls[0][0]
    expect(arg.headers).toEqual(["Metric", "Value"])
    expect(arg.filename).toBe("operations-overview_week")
    expect(arg.rows.some((r: unknown[]) => r[0] === "Active rolls" && r[1] === 42)).toBe(true)
  })

  it("invokes the branded PDF builder when 'Generate PDF Report' is clicked", async () => {
    render(<DashboardExportMenu input={FIXTURE} />)
    await act(async () => {
      fireEvent.click(screen.getByText(/generate pdf report/i))
    })

    expect(downloadOperationsPdf).toHaveBeenCalledTimes(1)
    expect(downloadOperationsPdf.mock.calls[0][0]).toMatchObject({
      period: "week",
      periodLabel: "Apr 21 – Apr 27",
      totalActiveRolls: 42,
    })
  })

  it("guards against duplicate dispatches while a PDF export is in flight", async () => {
    // The PDF builder is synchronous — the in-flight guard still matters for
    // re-clicks that fire inside the same task before isExporting resets.
    // Stub it to a slow async-ish op to exercise the guard.
    let resolvePdf: (() => void) | null = null
    downloadOperationsPdf.mockImplementationOnce(() => {
      // Pretend the work is queued on a microtask so we can interleave clicks.
      return new Promise<void>((resolve) => (resolvePdf = () => resolve()))
    })

    render(<DashboardExportMenu input={FIXTURE} />)
    fireEvent.click(screen.getByText(/generate pdf report/i))
    // Second click before the first resolves should be ignored.
    fireEvent.click(screen.getByText(/generate pdf report/i))
    fireEvent.click(screen.getByText(/export as csv/i))

    expect(downloadOperationsPdf).toHaveBeenCalledTimes(1)
    expect(exportToCSV).not.toHaveBeenCalled()

    await act(async () => {
      resolvePdf?.()
    })
    fireEvent.click(screen.getByText(/export as csv/i))
    expect(exportToCSV).toHaveBeenCalledTimes(1)
  })
})
