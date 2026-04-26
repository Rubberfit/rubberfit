/**
 * Click-through regression test for the Purchase Orders side of issue #122.
 * Pins that the PO Export dropdown actually invokes the export services and
 * surfaces a friendly toast when the filtered list is empty.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"

const { exportToCSV, generatePDFReport, toastError } = vi.hoisted(() => ({
  exportToCSV: vi.fn(),
  generatePDFReport: vi.fn().mockResolvedValue(undefined),
  toastError: vi.fn(),
}))

vi.mock("@/src/infrastructure/services/exportService", () => ({
  exportService: { exportToCSV },
}))
vi.mock("@/src/infrastructure/services/exportPdfService", () => ({
  exportPdfService: { generatePDFReport },
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
    generatePDFReport.mockClear()
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

  it("dispatches PDF export with the Purchase Orders title", async () => {
    render(<PurchaseOrdersExportMenu input={makeFixture()} />)
    await act(async () => {
      fireEvent.click(screen.getByText(/generate pdf report/i))
    })

    expect(generatePDFReport).toHaveBeenCalledTimes(1)
    const [title, content] = generatePDFReport.mock.calls[0]
    expect(title).toBe("Purchase Orders")
    expect(content).toContain("PO-0001")
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
})
