/**
 * Phase 3 PR 3d — smoke tests for the PO create route.
 *
 * Pins:
 *   - Renders the form shell + breadcrumb chain
 *   - Job-prefill bridge populates the first line item from the
 *     `?job_id=&material=&shortfall_sqft=` deep-link
 *   - The Submit button is disabled until a supplier + at least
 *     one item are present
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const toast = vi.hoisted(() => ({
  message: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

const useRouter = vi.hoisted(() => vi.fn())
const useSearchParams = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter, useSearchParams }))

const supplierGetActive = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/supplierService", () => ({
  supplierService: { getActiveSuppliers: supplierGetActive },
}))

const materialTypeGetAll = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/repositories/material-types.repository", () => ({
  materialTypeRepository: { getAll: materialTypeGetAll },
}))

vi.mock("@/src/infrastructure/services/taxService", () => ({
  taxService: { formatTaxRate: (r: number) => `${(r * 100).toFixed(2)}%` },
}))

const fetchCreateFormTax = vi.hoisted(() => vi.fn())
vi.mock("@/app/dashboard/inventory/purchase-orders/_components/po-tax-helpers", () => ({
  fetchCreateFormTaxDetails: fetchCreateFormTax,
  fetchEditFormTaxDetails: vi.fn(),
  fetchTaxDetails: vi.fn(),
}))

const createPurchaseOrder = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/purchase-orders", () => ({
  createPurchaseOrder,
  updatePurchaseOrder: vi.fn(),
  approvePurchaseOrder: vi.fn(),
}))

vi.mock("@/app/components/ui/select", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React: typeof import("react") = require("react")
  return {
    Select: ({
      value,
      onValueChange,
    }: {
      value: string
      onValueChange: (v: string) => void
      children: React.ReactNode
    }) => (
      <select
        data-testid="select-stub"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      />
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

import NewPurchaseOrderPage from "@/app/dashboard/inventory/purchase-orders/new/page"

const SAMPLE_SUPPLIER = {
  id: "s-1",
  user_id: "u1",
  name: "Acme Rubber Co.",
  city: "Akron",
  state: "OH",
  preferred: false,
  active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

const SAMPLE_MATERIAL = {
  id: "mt-epdm",
  user_id: "u1",
  name: "EPDM",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}

describe("New PO route (Phase 3 PR 3d)", () => {
  beforeEach(() => {
    toast.message.mockClear()
    toast.success.mockClear()
    useRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() })
    useSearchParams.mockReturnValue({ get: () => null })
    supplierGetActive.mockResolvedValue([
      // Fake entity: the page calls `.toJSON()` on each supplier
      // because supplierService.getActiveSuppliers() returns
      // `Supplier[]` entities (DDD). The toJSON method here returns
      // the row snapshot so the loader chain reaches setMaterialTypes,
      // which the prefill effect's `materialTypes.length === 0` gate
      // depends on.
      { ...SAMPLE_SUPPLIER, toJSON: () => SAMPLE_SUPPLIER },
    ])
    materialTypeGetAll.mockResolvedValue([SAMPLE_MATERIAL])
    fetchCreateFormTax.mockResolvedValue(null)
    createPurchaseOrder.mockReset()
  })

  it("renders the form shell breadcrumb + headline", async () => {
    render(<NewPurchaseOrderPage />)
    await waitFor(() => {
      expect(screen.queryByText("New purchase order")).not.toBeNull()
    })
    expect(screen.getByText("Order Details")).not.toBeNull()
    expect(screen.getByText("Line Items")).not.toBeNull()
    expect(screen.getByText("Addresses")).not.toBeNull()
  })

  it("Submit button is disabled until a supplier + items are present", async () => {
    render(<NewPurchaseOrderPage />)
    const submit = await screen.findByRole("button", { name: /Create purchase order/i })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
  })

  it("applies job-prefill from `?job_id=&material=&shortfall_sqft=`", async () => {
    useSearchParams.mockReturnValue({
      get: (key: string) =>
        key === "job_id"
          ? "job-1"
          : key === "material"
            ? "EPDM"
            : key === "shortfall_sqft"
              ? "12.5"
              : null,
    })
    render(<NewPurchaseOrderPage />)
    await waitFor(() => {
      expect(toast.message).toHaveBeenCalledWith(
        "PO prefilled from job shortfall.",
        expect.objectContaining({ description: expect.stringContaining("EPDM") })
      )
    })
  })
})
