"use client"

import { useState, useCallback } from "react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrders as purchaseOrdersSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { approvePurchaseOrder } from "@/app/actions/purchase-orders"
import { toast } from "sonner"

import { type TaxDetails, fetchTaxDetails as fetchTaxDetailsHelper } from "./po-tax-helpers"

interface UsePOActionsParams {
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrderWithDetails[]>>
  setSelectedPOTaxDetails: (details: TaxDetails | null) => void
}

export function usePOActions({ setPurchaseOrders, setSelectedPOTaxDetails }: UsePOActionsParams) {
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
