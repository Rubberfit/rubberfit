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
const { exportToCSV, generatePDFReport } = vi.hoisted(() => ({
  exportToCSV: vi.fn(),
  generatePDFReport: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/src/infrastructure/services/exportService", () => ({
  exportService: { exportToCSV },
}))
vi.mock("@/src/infrastructure/services/exportPdfService", () => ({
  exportPdfService: { generatePDFReport },
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
    }: {
      children: React.ReactNode
      onClick?: () => void
    }) => (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
  }
})

import { DashboardExportMenu } from "@/app/dashboard/_components/dashboard-export-menu"
import type { OperationsExportInput } from "@/app/dashboard/_components/dashboard-export-utils"

const FIXTURE: OperationsExportInput = {
  period: "week",
  weekLabel: "Apr 21 – Apr 27",
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
    generatePDFReport.mockClear()
  })

  it("renders an Export trigger that is disabled while loading", () => {
    render(<DashboardExportMenu input={FIXTURE} disabled />)
    const trigger = screen.getByRole("button", { name: /^export$/i }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
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

  it("dispatches PDF export with the Operations overview title when 'Generate PDF Report' is clicked", async () => {
    render(<DashboardExportMenu input={FIXTURE} />)
    await act(async () => {
      fireEvent.click(screen.getByText(/generate pdf report/i))
    })

    expect(generatePDFReport).toHaveBeenCalledTimes(1)
    const [title, content] = generatePDFReport.mock.calls[0]
    expect(title).toBe("Operations overview")
    expect(content).toContain("<h1>Operations overview</h1>")
    expect(content).toContain(">42<")
  })
})
