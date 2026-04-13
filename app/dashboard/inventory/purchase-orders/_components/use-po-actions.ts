"use client"

import { useState, useCallback } from "react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
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
        const useCase = resolveUseCase<IApprovePurchaseOrderUseCase>(
          TOKENS.IApprovePurchaseOrderUseCase
        )
        await useCase.execute({ purchaseOrderId: poId })
      } else {
        const response = await purchaseOrderService.updatePurchaseOrderStatus(poId, newStatus)
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
      console.error("Error updating PO status:", error)
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
