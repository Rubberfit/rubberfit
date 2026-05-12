/**
 * Click-through regression test for the Purchase Orders side of issue #122.
 * Pins that the PO Export dropdown actually invokes the export services and
 * surfaces a friendly toast when the filtered list is empty.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

// Phase 7 PR 4 — menu now calls `downloadPurchaseOrdersListPdf`
// directly (was `exportPdfService.downloadPdfListMock`). The hoisted
// mock has been renamed accordingly so the menu's import resolves to
// the spy.
// Typing the mock with the real `PurchaseOrdersExportInput` signature
// lets the call-args assertion compile without an `as` cast in the
// test body (CR catch — no-cast rule applies to test code).
const { exportToCSV, downloadPdfListMock, toastError } = vi.hoisted(() => {
  type DownloadPdfListFn = (
    input: import("@/app/dashboard/inventory/purchase-orders/_components/po-export-utils").PurchaseOrdersExportInput
  ) => Promise<void>
  return {
    exportToCSV: vi.fn(),
    downloadPdfListMock: vi.fn<DownloadPdfListFn>().mockResolvedValue(undefined),
    toastError: vi.fn(),
  }
})

vi.mock("@/src/infrastructure/services/exportService", () => ({
  exportService: { exportToCSV },
}))
vi.mock("@/app/dashboard/inventory/purchase-orders/_components/po-pdf", () => ({
  downloadPurchaseOrdersListPdf: downloadPdfListMock,
}))
vi.mock("sonner", () => ({ toast: { error: toastError } }))

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

import { PurchaseOrdersExportMenu } from "@/app/dashboard/inventory/purchase-orders/_components/po-export-menu"
import type { PurchaseOrdersExportInput } from "@/app/dashboard/inventory/purchase-orders/_components/po-export-utils"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

function makeFixture(
  overrides: Partial<PurchaseOrdersExportInput> = {}
): PurchaseOrdersExportInput {
  return {
    pos: [
      {
        id: "po-1",
        po_number: "PO-0001",
        supplier_id: "s",
        status: "ordered",
        total_amount: 500,
        subtotal: 500,
        tax_amount: 0,
        shipping_cost: 0,
        auto_generated: false,
        user_id: "u",
        created_at: "2026-04-20T00:00:00Z",
        updated_at: "2026-04-20T00:00:00Z",
        supplier: { id: "s", name: "Acme" },
        items_count: 1,
      } as unknown as PurchaseOrderWithDetails,
    ],
    filters: { status: "all", supplier: "all", search: "" },
    stats: { total: 1, totalValue: 500, draft: 0, pending: 0, ordered: 1, received: 0 },
    ...overrides,
  }
}

describe("PurchaseOrdersExportMenu", () => {
  beforeEach(() => {
    exportToCSV.mockClear()
    downloadPdfListMock.mockClear()
    toastError.mockClear()
  })

  it("dispatches CSV export through exportService when POs are present", () => {
    render(<PurchaseOrdersExportMenu input={makeFixture()} />)
    fireEvent.click(screen.getByText(/export as csv/i))

    expect(exportToCSV).toHaveBeenCalledTimes(1)
    const arg = exportToCSV.mock.calls[0][0]
    expect(arg.headers[0]).toBe("PO Number")
    expect(arg.filename).toBe("purchase-orders")
    expect(arg.rows[0][0]).toBe("PO-0001")
  })

  it("dispatches the PDF export through downloadPurchaseOrdersListPdf", async () => {
    render(<PurchaseOrdersExportMenu input={makeFixture()} />)
    await act(async () => {
      fireEvent.click(screen.getByText(/generate pdf report/i))
    })

    expect(downloadPdfListMock).toHaveBeenCalledTimes(1)
    const [input] = downloadPdfListMock.mock.calls[0] ?? []
    expect(input).toBeDefined()
    // Spot-check the input shape — the builder owns the visual output.
    // Typed mock means no cast on `input`.
    expect(input?.pos[0]?.po_number).toBe("PO-0001")
  })

  it("shows a toast and skips the export when no POs are loaded", () => {
    render(<PurchaseOrdersExportMenu input={makeFixture({ pos: [] })} />)
    fireEvent.click(screen.getByText(/export as csv/i))

    expect(exportToCSV).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith("No purchase orders to export")
  })

  it("disables the trigger while the page is loading", () => {
    render(<PurchaseOrdersExportMenu input={makeFixture()} disabled />)
    const trigger = screen.getByRole("button", { name: /^export$/i }) as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
  })

  it("ignores menu item clicks when the parent prop is disabled", () => {
    render(<PurchaseOrdersExportMenu input={makeFixture()} disabled />)
    fireEvent.click(screen.getByText(/export as csv/i))
    fireEvent.click(screen.getByText(/generate pdf report/i))
    expect(exportToCSV).not.toHaveBeenCalled()
    expect(downloadPdfListMock).not.toHaveBeenCalled()
  })

  it("guards against duplicate dispatches while a PDF export is in flight", async () => {
    let resolvePdf: (() => void) | null = null
    downloadPdfListMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => (resolvePdf = () => resolve()))
    )

    render(<PurchaseOrdersExportMenu input={makeFixture()} />)
    fireEvent.click(screen.getByText(/generate pdf report/i))
    fireEvent.click(screen.getByText(/generate pdf report/i))
    fireEvent.click(screen.getByText(/export as csv/i))

    expect(downloadPdfListMock).toHaveBeenCalledTimes(1)
    expect(exportToCSV).not.toHaveBeenCalled()

    await act(async () => {
      resolvePdf?.()
    })
    fireEvent.click(screen.getByText(/export as csv/i))
    expect(exportToCSV).toHaveBeenCalledTimes(1)
  })
})
