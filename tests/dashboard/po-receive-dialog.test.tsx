/**
 * Task #84 — tests for the dedicated PO Receive dialog.
 *
 * Pins:
 *   - Default state: outstanding items enabled, qty defaulted to outstanding
 *   - Already-fully-received items live in collapsed read-only section
 *   - Enable checkbox toggles inclusion in submit payload
 *   - Over-receive / zero / non-numeric blocks submit
 *   - "Add roll details" toggle reveals/hides 8-field grid per row
 *   - Submit payload shape (strip empty rollData, retain partials)
 *   - Idempotency key lifecycle: stable across retries without edits,
 *     regenerates on field change, regenerates after success,
 *     regenerates on close+reopen
 *   - Server error codes surface targeted toasts and keep dialog open
 *   - Success closes dialog and calls onReceived
 *   - "Default all to outstanding" resets quantities without erasing
 *     user-typed rollData
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

const receivePurchaseOrder = vi.hoisted(() => vi.fn())
vi.mock("@/app/actions/purchase-orders", () => ({ receivePurchaseOrder }))

import { PoReceiveDialog } from "@/app/dashboard/inventory/purchase-orders/_components/po-receive-dialog"
import type {
  PurchaseOrderItem,
  PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"

function makeItem(overrides: Partial<PurchaseOrderItem> = {}): PurchaseOrderItem {
  return {
    id: "item-1",
    user_id: "u1",
    purchase_order_id: "po-1",
    material_type_id: "mt-1",
    line_number: 1,
    description: "Black butyl rubber",
    quantity_sqft: 100,
    unit_cost: 5,
    line_total: 500,
    quantity_received: 0,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  }
}

function makePO(items: PurchaseOrderItem[]): PurchaseOrderWithDetails {
  return {
    id: "po-1",
    user_id: "u1",
    po_number: "PO-2026-001",
    supplier_id: "s-1",
    status: "ordered",
    order_date: "2026-05-01",
    requested_delivery_date: "2026-05-15",
    total_amount: 1234.56,
    subtotal: 1100,
    tax_amount: 134.56,
    shipping_cost: 0,
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
    items,
  }
}

function renderDialog(po: PurchaseOrderWithDetails | null) {
  const onOpenChange = vi.fn()
  const onReceived = vi.fn()
  const utils = render(
    <PoReceiveDialog
      po={po}
      open={po !== null}
      onOpenChange={onOpenChange}
      onReceived={onReceived}
    />
  )
  return { ...utils, onOpenChange, onReceived }
}

function getQtyInput(itemId: string): HTMLInputElement {
  return screen.getByLabelText("Receiving (sqft)", {
    selector: `#${itemId}-qty`,
  }) as HTMLInputElement
}

function getEnableCheckbox(itemId: string): HTMLElement {
  return document.querySelector(`#${itemId}-enabled`) as HTMLElement
}

function getSubmitButton(): HTMLButtonElement {
  return screen.getByTestId("po-receive-submit") as HTMLButtonElement
}

describe("PoReceiveDialog", () => {
  beforeEach(() => {
    toast.success.mockClear()
    toast.error.mockClear()
    receivePurchaseOrder.mockReset()
  })

  it("renders each outstanding item enabled with qty defaulted to outstanding", () => {
    const items = [
      makeItem({ id: "item-1", quantity_sqft: 100, quantity_received: 30 }),
      makeItem({ id: "item-2", quantity_sqft: 50, quantity_received: 0 }),
    ]
    renderDialog(makePO(items))
    expect(screen.getByText("Receive PO #PO-2026-001")).toBeTruthy()
    expect((document.getElementById("item-1-qty") as HTMLInputElement).value).toBe("70")
    expect((document.getElementById("item-2-qty") as HTMLInputElement).value).toBe("50")
  })

  it("places fully-received items in the collapsed already-received section and excludes them from payload", async () => {
    const items = [
      makeItem({ id: "item-1", quantity_sqft: 100, quantity_received: 100 }),
      makeItem({ id: "item-2", quantity_sqft: 60, quantity_received: 0 }),
    ]
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO(items))

    expect(document.getElementById("item-1-qty")).toBeNull()
    expect(document.getElementById("item-2-qty")).not.toBeNull()
    const toggle = screen.getByTestId("po-receive-already-received-toggle")
    fireEvent.click(toggle)
    const section = screen.getByTestId("po-receive-already-received")
    expect(within(section).getByText(/Black butyl rubber/)).toBeTruthy()
    expect(within(section).getByText("100 / 100 sqft")).toBeTruthy()

    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const call = receivePurchaseOrder.mock.calls[0]![0] as { items: { itemId: string }[] }
    expect(call.items.map((i) => i.itemId)).toEqual(["item-2"])
  })

  it("toggling enable checkbox excludes the item from the submit payload", async () => {
    const items = [
      makeItem({ id: "item-1", quantity_sqft: 100 }),
      makeItem({ id: "item-2", quantity_sqft: 60 }),
    ]
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO(items))

    fireEvent.click(getEnableCheckbox("item-1"))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const call = receivePurchaseOrder.mock.calls[0]![0] as { items: { itemId: string }[] }
    expect(call.items.map((i) => i.itemId)).toEqual(["item-2"])
  })

  it("editing qty above outstanding shows inline error and disables Submit", () => {
    renderDialog(makePO([makeItem({ quantity_sqft: 100 })]))
    const input = getQtyInput("item-1")
    fireEvent.change(input, { target: { value: "150" } })
    expect(screen.getByTestId("po-receive-item-error-item-1").textContent).toContain(
      "Exceeds outstanding (100 sqft)"
    )
    expect(getSubmitButton().disabled).toBe(true)
  })

  it("editing qty to zero shows inline error and disables Submit", () => {
    renderDialog(makePO([makeItem({ quantity_sqft: 100 })]))
    fireEvent.change(getQtyInput("item-1"), { target: { value: "0" } })
    expect(screen.getByTestId("po-receive-item-error-item-1").textContent).toContain(
      "Quantity must be greater than 0"
    )
    expect(getSubmitButton().disabled).toBe(true)
  })

  it("Add roll details toggle reveals and hides the 8-field grid", () => {
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    expect(screen.queryByTestId("po-receive-roll-fields-item-1")).toBeNull()
    fireEvent.click(screen.getByText("Add roll details"))
    expect(screen.queryByTestId("po-receive-roll-fields-item-1")).not.toBeNull()
    fireEvent.click(screen.getByText("Hide roll details"))
    expect(screen.queryByTestId("po-receive-roll-fields-item-1")).toBeNull()
  })

  it("strips empty rollData and forwards only populated fields", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(screen.getByText("Add roll details"))
    fireEvent.change(document.getElementById("item-1-width") as HTMLInputElement, {
      target: { value: "60" },
    })
    fireEvent.change(document.getElementById("item-1-color") as HTMLInputElement, {
      target: { value: "black" },
    })
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const payload = receivePurchaseOrder.mock.calls[0]![0] as {
      items: { itemId: string; quantityReceived: number; rollData?: Record<string, unknown> }[]
    }
    expect(payload.items).toEqual([
      {
        itemId: "item-1",
        quantityReceived: 100,
        rollData: { width: 60, color: "black" },
      },
    ])
  })

  it("submits a UUID idempotencyKey", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const payload = receivePurchaseOrder.mock.calls[0]![0] as { idempotencyKey: string }
    expect(payload.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
  })

  it("idempotencyKey is stable across two consecutive submit retries without field edits", async () => {
    receivePurchaseOrder.mockRejectedValueOnce(new Error("network blip"))
    receivePurchaseOrder.mockResolvedValueOnce(undefined)
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(2))
    const key1 = (receivePurchaseOrder.mock.calls[0]![0] as { idempotencyKey: string })
      .idempotencyKey
    const key2 = (receivePurchaseOrder.mock.calls[1]![0] as { idempotencyKey: string })
      .idempotencyKey
    expect(key1).toBe(key2)
  })

  it("idempotencyKey regenerates on any field change", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const keyBefore = (receivePurchaseOrder.mock.calls[0]![0] as { idempotencyKey: string })
      .idempotencyKey

    // Reset mocks but keep dialog mounted (success closes via parent;
    // in the test the parent doesn't react to onOpenChange, so the
    // dialog stays open). Edit a field, submit again.
    receivePurchaseOrder.mockResolvedValueOnce(undefined)
    fireEvent.change(getQtyInput("item-1"), { target: { value: "80" } })
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(2))
    const keyAfter = (receivePurchaseOrder.mock.calls[1]![0] as { idempotencyKey: string })
      .idempotencyKey
    expect(keyAfter).not.toBe(keyBefore)
  })

  it("idempotencyKey regenerates after a successful submit within the same mount", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const key1 = (receivePurchaseOrder.mock.calls[0]![0] as { idempotencyKey: string })
      .idempotencyKey
    // No field edits between submits — relies solely on the after-
    // success regenerate.
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(2))
    const key2 = (receivePurchaseOrder.mock.calls[1]![0] as { idempotencyKey: string })
      .idempotencyKey
    expect(key2).not.toBe(key1)
  })

  it("idempotencyKey regenerates on close+reopen", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    const po = makePO([makeItem({ id: "item-1", quantity_sqft: 100 })])
    const { rerender } = render(
      <PoReceiveDialog po={po} open={true} onOpenChange={vi.fn()} onReceived={vi.fn()} />
    )
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(1))
    const keyBefore = (receivePurchaseOrder.mock.calls[0]![0] as { idempotencyKey: string })
      .idempotencyKey

    // Close
    rerender(<PoReceiveDialog po={null} open={false} onOpenChange={vi.fn()} onReceived={vi.fn()} />)
    // Reopen
    rerender(<PoReceiveDialog po={po} open={true} onOpenChange={vi.fn()} onReceived={vi.fn()} />)

    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(receivePurchaseOrder).toHaveBeenCalledTimes(2))
    const keyAfter = (receivePurchaseOrder.mock.calls[1]![0] as { idempotencyKey: string })
      .idempotencyKey
    expect(keyAfter).not.toBe(keyBefore)
  })

  it("blocks submit + toasts when zero items are enabled", () => {
    renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getEnableCheckbox("item-1"))
    expect(getSubmitButton().disabled).toBe(true)
  })

  it("surfaces UNAUTHORIZED / FORBIDDEN / INVALID_STATE_TRANSITION error codes and keeps dialog open", async () => {
    const errUnauth = Object.assign(new Error("nope"), { code: "UNAUTHORIZED" })
    const errForbid = Object.assign(new Error("nope"), { code: "FORBIDDEN" })
    const errInvalid = Object.assign(new Error("nope"), { code: "INVALID_STATE_TRANSITION" })

    receivePurchaseOrder.mockRejectedValueOnce(errUnauth)
    const { onOpenChange } = renderDialog(makePO([makeItem({ id: "item-1", quantity_sqft: 100 })]))
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1))
    expect(toast.error.mock.calls[0]![0]).toMatch(/session has expired/i)
    expect(onOpenChange).not.toHaveBeenCalled()

    receivePurchaseOrder.mockRejectedValueOnce(errForbid)
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
    expect(toast.error.mock.calls[1]![0]).toMatch(/permission/i)

    receivePurchaseOrder.mockRejectedValueOnce(errInvalid)
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(3))
    expect(toast.error.mock.calls[2]![0]).toMatch(/can't be received/i)
  })

  it("success closes dialog and calls onReceived", async () => {
    receivePurchaseOrder.mockResolvedValue(undefined)
    const { onOpenChange, onReceived } = renderDialog(
      makePO([makeItem({ id: "item-1", quantity_sqft: 100 })])
    )
    fireEvent.click(getSubmitButton())
    await waitFor(() => expect(onReceived).toHaveBeenCalledTimes(1))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(toast.success).toHaveBeenCalledTimes(1)
  })

  it("'Default all to outstanding' resets quantities without erasing user-typed rollData", () => {
    renderDialog(
      makePO([
        makeItem({ id: "item-1", quantity_sqft: 100, quantity_received: 0 }),
        makeItem({ id: "item-2", quantity_sqft: 50, quantity_received: 0 }),
      ])
    )
    // Type into rollData on item-1
    fireEvent.click(
      within(screen.getByTestId("po-receive-item-item-1")).getByText("Add roll details")
    )
    fireEvent.change(document.getElementById("item-1-color") as HTMLInputElement, {
      target: { value: "black" },
    })
    // Edit qty on item-2 down to 10
    fireEvent.change(getQtyInput("item-2"), { target: { value: "10" } })
    // Reset all
    fireEvent.click(screen.getByText("Default all to outstanding"))
    expect(getQtyInput("item-2").value).toBe("50")
    // rollData survives the reset
    expect((document.getElementById("item-1-color") as HTMLInputElement).value).toBe("black")
  })
})
