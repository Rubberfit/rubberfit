"use client"

import { useState, useCallback } from "react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrders as purchaseOrdersSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { approvePurchaseOrder, receivePurchaseOrder } from "@/app/actions/purchase-orders"
import { toast } from "sonner"

import { type TaxDetails, fetchTaxDetails as fetchTaxDetailsHelper } from "./po-tax-helpers"

interface UsePOActionsParams {
  /**
   * Current list of POs — read-only handle so the receive flow can
   * look up the target PO's items + outstanding quantities by id
   * without re-fetching. The row dropdown's "Receive goods" action
   * passes only a `poId`, so we resolve the items here at submit
   * time. Kept as a separate prop from the setter to make the read
   * intent explicit and to avoid the functional-setter peek trick.
   */
  purchaseOrders: PurchaseOrderWithDetails[]
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrderWithDetails[]>>
  setSelectedPOTaxDetails: (details: TaxDetails | null) => void
}

export function usePOActions({
  purchaseOrders,
  setPurchaseOrders,
  setSelectedPOTaxDetails,
}: UsePOActionsParams) {
  const [confirmAction, setConfirmAction] = useState<{
    open: boolean
    action: () => void
    title: string
    description: string
    variant?: "danger" | "warning" | "info"
  }>({
    open: false,
    action: () => {},
    title: "",
    description: "",
    variant: "danger",
  })

  const fetchTaxDetailsForPO = useCallback(
    async (po: PurchaseOrderWithDetails) => {
      const details = await fetchTaxDetailsHelper(po)
      setSelectedPOTaxDetails(details)
    },
    [setSelectedPOTaxDetails]
  )

  /**
   * Returns `true` if the status update succeeded, `false` if the
   * request rejected (errors are toasted internally; callers like
   * the row dropdown can ignore the return; the drawer Submit
   * button gates `onClose()` on the truthy result so a silent
   * failure doesn't close the panel).
   */
  const updatePOStatus = async (
    poId: string,
    newStatus: PurchaseOrder["status"]
  ): Promise<boolean> => {
    try {
      if (newStatus === "approved") {
        // Approve continues through the orchestration use case (now
        // wrapped in the `approvePurchaseOrder` server action) so the
        // in-app notification side effect still fires under flag-OFF.
        // The SDK's flag-ON path fires the same notification via
        // `send_po_approved` in rf-application, so the behavior is
        // equivalent either way.
        await approvePurchaseOrder({ purchaseOrderId: poId })
      } else if (newStatus === "received") {
        // Step 7c-1 wiring: the "Receive goods" row action now goes
        // through the `receivePurchaseOrder` server action →
        // `ReceivePurchaseOrderUseCase` → idempotent receipt
        // persistence + best-effort roll creation. The legacy SDK
        // path (`purchaseOrdersSdk.updateStatus(poId, {status: "received"})`)
        // bypassed the idempotency guard entirely — a double-click
        // could re-apply the same quantity twice. This path anchors
        // every receipt row in `po_item_receipts` keyed by
        // `(itemId, idempotencyKey)`, so a retry of the same
        // submission collides on the UNIQUE constraint and the
        // service reports the item as `alreadyApplied`.
        //
        // The row-level "mark received" gesture has no detail form
        // yet (Task #84 in the roadmap covers a per-item dialog),
        // so we default each item's `quantityReceived` to its
        // outstanding sqft — i.e. "receive everything not yet
        // received." This matches the legacy
        // `updateStatus("received")` semantics (which just flipped
        // the status without touching quantities) but now also
        // records proper receipts behind the scenes.
        //
        // `idempotencyKey` lifetime: generated fresh inside this
        // try/catch so a Sonner-toasted failure followed by a
        // user-initiated retry (operator clicks Receive again)
        // counts as a new logical attempt with a new key. Per-mount
        // caching kicks in once the dedicated receive dialog ships.
        const po = purchaseOrders.find((p) => p.id === poId)
        if (!po || !po.items || po.items.length === 0) {
          toast.error("Cannot receive: no items on this purchase order.")
          return false
        }
        const items = po.items
          .map((item) => ({
            itemId: item.id,
            // Outstanding = total ordered minus what's already
            // received. Skip items with zero outstanding so the
            // Zod schema's `.positive()` check on
            // `quantityReceived` doesn't reject the whole batch
            // when one line was already fully received on a
            // prior partial.
            quantityReceived: Math.max(0, item.quantity_sqft - (item.quantity_received ?? 0)),
          }))
          .filter((item) => item.quantityReceived > 0)
        if (items.length === 0) {
          toast.error("Cannot receive: every line item is already fully received.")
          return false
        }
        await receivePurchaseOrder({
          purchaseOrderId: poId,
          idempotencyKey: crypto.randomUUID(),
          items,
        })
      } else {
        // SDK delegates to Rust under `NEXT_PUBLIC_USE_RUST_PROCUREMENT=true`
        // and to the legacy service otherwise. Flag-ON rejects
        // `received` through this path with RECEIVED_REQUIRES_RECEIVE_FLOW
        // — the catch block below surfaces the stable code with a
        // friendly hint pointing users at the receive flow.
        const response = await purchaseOrdersSdk.updateStatus(poId, {
          status: newStatus,
        })
        if (!response) throw new Error("Failed to update status")
      }

      setPurchaseOrders((pos) =>
        pos.map((po) => (po.id === poId ? { ...po, status: newStatus } : po))
      )

      switch (newStatus) {
        case "pending":
          toast.success("Purchase order submitted for approval")
          break
        case "approved":
          toast.success("Purchase order approved")
          break
        case "ordered":
          toast.success("Purchase order marked as ordered")
          break
        case "received":
          toast.success("Goods received and inventory updated")
          break
        case "cancelled":
          toast.success("Purchase order cancelled")
          break
      }
      return true
    } catch (error) {
      const err = error as Error & { code?: string; status?: number }
      console.error("Error updating PO status:", error)
      // Surface the stable conflict codes with guidance instead of
      // a generic "failed" toast. The body carries `allowedTargets`
      // (read via the parity-tested shape); we don't render those
      // directly here yet — follow-up UX ticket will expose them
      // as a picker on the toast.
      //
      // The server action throws three typed error classes whose
      // prototype chain doesn't survive the RPC boundary, so we
      // discriminate on `error.code` (per CLAUDE.md's action-wiring
      // contract): UNAUTHORIZED → 401, FORBIDDEN → 403, AUTH_CONFIG
      // → 5xx. Zod parse failures bubble up as plain `ZodError` with
      // no `code` on the top-level error — they fall through to the
      // generic toast.
      if (err.code === "UNAUTHORIZED") {
        toast.error("Your session has expired. Sign in again to continue.")
        return false
      }
      if (err.code === "FORBIDDEN") {
        toast.error("You don't have permission to perform this action.")
        return false
      }
      if (err.code === "AUTH_CONFIG") {
        toast.error("Server misconfiguration — contact your administrator.")
        return false
      }
      if (err.code === "RECEIVED_REQUIRES_RECEIVE_FLOW") {
        toast.error("Use the receive flow on the PO detail view to mark items as received.", {
          description: "Status can't go to `received` through the row menu.",
        })
        return false
      }
      if (err.code === "INVALID_STATE_TRANSITION") {
        toast.error("That status transition isn't allowed from the current state.", {
          description: "Refresh the list and try again.",
        })
        return false
      }
      toast.error("Failed to update purchase order status")
      return false
    }
  }

  return {
    updatePOStatus,
    fetchTaxDetailsForPO,
    confirmAction,
    setConfirmAction,
  }
}
