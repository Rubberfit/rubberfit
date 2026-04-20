"use client"

import { useState, useCallback } from "react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrders as purchaseOrdersSdk } from "@/src/infrastructure/api-client/rf/procurement"
import type { IApprovePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/approve-purchase-order.use-case"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { toast } from "sonner"

import { type TaxDetails, fetchTaxDetails as fetchTaxDetailsHelper } from "./po-tax-helpers"
import { type POFormData } from "./po-form-dialog"
import { createPO, updatePO, validatePOFormData } from "./po-action-handlers"

interface UsePOActionsParams {
  suppliers: Supplier[]
  fetchData: () => Promise<void>
  setPurchaseOrders: React.Dispatch<React.SetStateAction<PurchaseOrderWithDetails[]>>
  setSelectedPO: (po: PurchaseOrderWithDetails | null) => void
  setIsViewDialogOpen: (open: boolean) => void
  setSelectedPOTaxDetails: (details: TaxDetails | null) => void
}

export function usePOActions({
  suppliers,
  fetchData,
  setPurchaseOrders,
  setSelectedPO,
  setIsViewDialogOpen,
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

  const updatePOStatus = async (poId: string, newStatus: PurchaseOrder["status"]) => {
    try {
      if (newStatus === "approved") {
        // Approve continues through the existing DI-registered use
        // case so the in-app notification side effect still fires
        // under flag-OFF. The SDK's flag-ON path fires the same
        // notification via `send_po_approved` in rf-application,
        // so the behavior is equivalent either way.
        const useCase = resolveUseCase<IApprovePurchaseOrderUseCase>(
          TOKENS.IApprovePurchaseOrderUseCase
        )
        await useCase.execute({ purchaseOrderId: poId })
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
    } catch (error) {
      const err = error as Error & { code?: string; status?: number }
      console.error("Error updating PO status:", error)
      // Surface the stable conflict codes with guidance instead of
      // a generic "failed" toast. The body carries `allowedTargets`
      // (read via the parity-tested shape); we don't render those
      // directly here yet — follow-up UX ticket will expose them
      // as a picker on the toast.
      if (err.code === "RECEIVED_REQUIRES_RECEIVE_FLOW") {
        toast.error(
          "Use the receive flow on the PO detail view to mark items as received.",
          { description: "Status can't go to `received` through the row menu." }
        )
        return
      }
      if (err.code === "INVALID_STATE_TRANSITION") {
        toast.error("That status transition isn't allowed from the current state.", {
          description: "Refresh the list and try again.",
        })
        return
      }
      toast.error("Failed to update purchase order status")
    }
  }

  const handleCreatePO = async (
    formData: POFormData,
    setIsCreating: (v: boolean) => void,
    setIsCreateDialogOpen: (v: boolean) => void,
    setFormData: (v: POFormData) => void
  ) => {
    if (!validatePOFormData(formData)) return

    setIsCreating(true)
    try {
      await createPO({
        formData,
        suppliers,
        fetchData,
        setSelectedPO,
        setIsViewDialogOpen,
        fetchTaxDetailsForPO,
        setIsCreateDialogOpen,
        setFormData,
      })
    } catch (error) {
      console.error("Error creating purchase order:", error)
      toast.error("Failed to create purchase order. Please try again.")
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdatePO = async (
    editFormData: POFormData,
    editingPO: PurchaseOrderWithDetails,
    setIsUpdating: (v: boolean) => void,
    setIsEditDialogOpen: (v: boolean) => void,
    setEditingPO: (v: PurchaseOrderWithDetails | null) => void,
    setEditFormData: (v: POFormData) => void
  ) => {
    if (!validatePOFormData(editFormData)) return

    setIsUpdating(true)
    try {
      await updatePO({
        editFormData,
        editingPO,
        suppliers,
        fetchData,
        setIsEditDialogOpen,
        setEditingPO,
        setEditFormData,
      })
    } catch (error) {
      console.error("Error updating purchase order:", error)
      toast.error("Failed to update purchase order. Please try again.")
    } finally {
      setIsUpdating(false)
    }
  }

  const handleConfirmRemoveItem = (action: () => void, index: number) => {
    setConfirmAction({
      open: true,
      action,
      title: "Remove Item?",
      description: `Are you sure you want to remove Item #${index + 1} from this purchase order?`,
      variant: "warning",
    })
  }

  return {
    updatePOStatus,
    handleCreatePO,
    handleUpdatePO,
    fetchTaxDetailsForPO,
    confirmAction,
    setConfirmAction,
    handleConfirmRemoveItem,
  }
}
