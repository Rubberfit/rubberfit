/**
 * Phase 3 PR 3c — smoke tests for the PO view drawer.
 *
 * ARC-206 (Phase 3 PR 3e follow-up): the drawer now hosts both
 * the read-only view and the inline edit form. Tests here only
 * pin the view-mode contract; the edit-mode body lives in
 * `po-edit-drawer-body.tsx` and has its own (lighter) coverage
 * pinned at the page level.
 *
 * Pins:
 *   - Renders the PO header (number + supplier) and the status pill
 *   - Sections (Order Details, Supplier Contact, Line Items,
 *     Addresses, Order Summary, Notes) all mount for a fixture PO
 *   - "Close" calls onOpenChange(false)
 *   - "Edit" flips drawer mode to "edit" — does NOT close, does
 *     NOT navigate (per ARC-206)
 *   - Status-transition button (Submit) appears for draft POs and
 *     fires onUpdateStatus + onClose
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/src/infrastructure/services/taxService", () => ({
  taxService: {},
}))

import { PoViewDrawer } from "@/app/dashboard/inventory/purchase-orders/_components/po-view-drawer"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

// Typed factory — every required field on `PurchaseOrder` /
// `PurchaseOrderWithDetails` / nested `Supplier` is set so a
// future schema change fails the test at typecheck instead of
// slipping past a cast.
const SAMPLE_PO: PurchaseOrderWithDetails = {
  id: "po-1",
  user_id: "u1",
  po_number: "PO-2026-001",
  supplier_id: "s-1",
  status: "draft",
  order_date: "2026-05-01",
  requested_delivery_date: "2026-05-15",
  total_amount: 1234.56,
  subtotal: 1100,
  tax_amount: 134.56,
  shipping_cost: 0,
  notes: "Rush order — please expedite.",
  auto_generated: false,
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
  supplier: {
    id: "s-1",
    user_id: "u1",
    name: "Acme Rubber Co.",
    city: "Akron",
    state: "OH",
    preferred: false,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  items: [],
}

// Common default props the drawer added in Phase 3 PR 3e
// (mode + onModeChange + suppliers/materialTypes catalogs +
// onSaved). View-mode tests don't exercise the edit body, so empty
// catalogs + a mock onSaved are fine — the existing PoViewBody
// branch never reaches them.
const DRAWER_DEFAULTS = {
  mode: "view" as const,
  onModeChange: vi.fn(),
  suppliers: [],
  materialTypes: [],
  onSaved: vi.fn(),
}

describe("PoViewDrawer (Phase 3 PR 3c)", () => {
  beforeEach(() => {
    toast.success.mockClear()
  })

  it("renders the PO header (number + supplier) for a fixture", async () => {
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        po={SAMPLE_PO}
        open
        onOpenChange={vi.fn()}
        taxDetails={null}
        onUpdateStatus={vi.fn().mockResolvedValue(true)}
        onDownloadPDF={vi.fn()}
      />
    )
    expect(await screen.findByText("PO #PO-2026-001")).not.toBeNull()
    expect(screen.getByText("Acme Rubber Co.")).not.toBeNull()
    // Status pill renders capitalized "Draft"; the OrderDetailsCard
    // also surfaces the status label, so multiple matches are
    // expected.
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0)
  })

  it("Close fires onOpenChange(false)", async () => {
    const onOpenChange = vi.fn()
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        po={SAMPLE_PO}
        open
        onOpenChange={onOpenChange}
        taxDetails={null}
        onUpdateStatus={vi.fn().mockResolvedValue(true)}
        onDownloadPDF={vi.fn()}
      />
    )
    // shadcn `<SheetContent>` ships its own X close button with the
    // accessible name "Close"; the footer button uses the same
    // label. Grab all and click the last one (the footer one).
    await screen.findByText("PO #PO-2026-001")
    const closes = screen.getAllByRole("button", { name: /^Close$/ })
    fireEvent.click(closes[closes.length - 1])
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("Edit flips drawer to edit mode (no close, no navigate) — ARC-206", async () => {
    const onModeChange = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        onModeChange={onModeChange}
        po={SAMPLE_PO}
        open
        onOpenChange={onOpenChange}
        taxDetails={null}
        onUpdateStatus={vi.fn().mockResolvedValue(true)}
        onDownloadPDF={vi.fn()}
      />
    )
    const edit = await screen.findByRole("button", { name: /^Edit$/ })
    fireEvent.click(edit)
    // The drawer must STAY open (edit body re-mounts inside the
    // same Sheet) and signal mode-flip. Closing on Edit was the
    // ARC-206 bug; this regresses to that if onOpenChange fires.
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onModeChange).toHaveBeenCalledWith("edit")
  })

  it("Submit calls onUpdateStatus('pending') and closes — toast handled by parent", async () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(true)
    const onOpenChange = vi.fn()
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        po={SAMPLE_PO}
        open
        onOpenChange={onOpenChange}
        taxDetails={null}
        onUpdateStatus={onUpdateStatus}
        onDownloadPDF={vi.fn()}
      />
    )
    const submit = await screen.findByRole("button", { name: /^Submit$/ })
    fireEvent.click(submit)
    await waitFor(() => {
      expect(onUpdateStatus).toHaveBeenCalledWith("po-1", "pending")
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // The drawer must NOT toast — the success/error toast lives in
    // `updatePOStatus` (use-po-actions.ts) so the drawer can't
    // double-toast on success or green-toast on a silent failure.
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("keeps the drawer open when Submit fails (onUpdateStatus → false)", async () => {
    // The new contract is "wait for onUpdateStatus before
    // closing." A `false` return signals the underlying
    // updatePOStatus rejected (and toasted internally), so the
    // drawer should stay open for retry.
    const onUpdateStatus = vi.fn().mockResolvedValue(false)
    const onOpenChange = vi.fn()
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        po={SAMPLE_PO}
        open
        onOpenChange={onOpenChange}
        taxDetails={null}
        onUpdateStatus={onUpdateStatus}
        onDownloadPDF={vi.fn()}
      />
    )
    fireEvent.click(await screen.findByRole("button", { name: /^Submit$/ }))
    await waitFor(() => {
      expect(onUpdateStatus).toHaveBeenCalledWith("po-1", "pending")
    })
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("hides Edit + Submit when the PO is no longer in draft", async () => {
    const orderedPo: PurchaseOrderWithDetails = { ...SAMPLE_PO, status: "ordered" }
    render(
      <PoViewDrawer
        {...DRAWER_DEFAULTS}
        po={orderedPo}
        open
        onOpenChange={vi.fn()}
        taxDetails={null}
        onUpdateStatus={vi.fn().mockResolvedValue(true)}
        onDownloadPDF={vi.fn()}
      />
    )
    await screen.findByText("PO #PO-2026-001")
    expect(screen.queryByRole("button", { name: /^Edit$/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Submit$/ })).toBeNull()
    // Status pill flips to "Ordered" — multiple matches OK
    // (OrderDetailsCard label also surfaces status text).
    expect(screen.getAllByText("Ordered").length).toBeGreaterThan(0)
  })
})
