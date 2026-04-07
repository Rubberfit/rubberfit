"use client"

import { useState, useEffect } from "react"
import { format, addDays } from "date-fns"

import { type PurchaseOrderWithDetails, type Supplier } from "@/lib/supabase"

import {
  type TaxDetails,
  fetchCreateFormTaxDetails as fetchCreateFormTaxDetailsHelper,
  fetchEditFormTaxDetails as fetchEditFormTaxDetailsHelper,
} from "./po-tax-helpers"
import { type POFormData, getDefaultFormData, buildSupplierAddress } from "./po-form-dialog"

export function usePOFormState(suppliers: Supplier[]) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingPO, setEditingPO] = useState<PurchaseOrderWithDetails | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [createFormTaxDetails, setCreateFormTaxDetails] = useState<TaxDetails | null>(null)
  const [editFormTaxDetails, setEditFormTaxDetails] = useState<TaxDetails | null>(null)
  const [formData, setFormData] = useState<POFormData>(getDefaultFormData())
  const [editFormData, setEditFormData] = useState<POFormData>(getDefaultFormData())

  // Tax details effects
  useEffect(() => {
    const doFetch = async () => {
      const details = await fetchCreateFormTaxDetailsHelper(formData.supplier_id, formData.items)
      setCreateFormTaxDetails(details)
    }
    doFetch()
  }, [formData.supplier_id, formData.items])

  useEffect(() => {
    const doFetch = async () => {
      const details = await fetchEditFormTaxDetailsHelper(
        editFormData.supplier_id,
        editFormData.items
      )
      setEditFormTaxDetails(details)
    }
    doFetch()
  }, [editFormData.supplier_id, editFormData.items])

  // Edit PO handler
  const handleEditPO = (po: PurchaseOrderWithDetails) => {
    setEditingPO(po)
    const supplier = suppliers.find((s) => s.id === po.supplier_id)
    const supplierAddress = buildSupplierAddress(supplier)

    setEditFormData({
      supplier_id: po.supplier_id,
      requested_delivery_date: po.requested_delivery_date
        ? format(new Date(po.requested_delivery_date), "yyyy-MM-dd")
        : format(addDays(new Date(), 7), "yyyy-MM-dd"),
      payment_terms: po.payment_terms || "Net 30",
      shipping_address: po.shipping_address || supplierAddress || "",
      billing_address: po.billing_address || supplierAddress || "",
      notes: po.notes || "",
      items:
        po.items?.map((item) => ({
          material_type_id: item.material_type_id || "",
          description: item.description || "",
          width: item.width || undefined,
          length: undefined,
          thickness: item.thickness || undefined,
          color: item.color || "",
          quantity_sqft: item.quantity_sqft,
          unit_cost: item.unit_cost,
        })) || [],
    })
    setIsEditDialogOpen(true)
  }

  return {
    // Create dialog
    isCreateDialogOpen,
    setIsCreateDialogOpen,
    formData,
    setFormData,
    isCreating,
    setIsCreating,
    createFormTaxDetails,

    // Edit dialog
    isEditDialogOpen,
    setIsEditDialogOpen,
    editingPO,
    setEditingPO,
    editFormData,
    setEditFormData,
    isUpdating,
    setIsUpdating,
    editFormTaxDetails,
    handleEditPO,
  }
}
