import { supabase, type PurchaseOrderWithDetails, type Supplier } from "@/app/lib/supabase"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { taxService } from "@/src/infrastructure/services/taxService"
import { toast } from "sonner"

import { type POFormData, getDefaultFormData } from "./po-form-dialog"

export function validatePOFormData(formData: POFormData): boolean {
  if (!formData.supplier_id) {
    toast.error("Please select a supplier")
    return false
  }
  if (formData.items.length === 0) {
    toast.error("Please add at least one item to the purchase order")
    return false
  }

  for (const [index, item] of formData.items.entries()) {
    if (!item.material_type_id) {
      toast.error(`Please select a material type for item #${index + 1}`)
      return false
    }
    if (!item.quantity_sqft || item.quantity_sqft <= 0) {
      toast.error(`Please enter a valid quantity for item #${index + 1}`)
      return false
    }
    if (!item.unit_cost || item.unit_cost <= 0) {
      toast.error(`Please enter a valid unit cost for item #${index + 1}`)
      return false
    }
  }

  return true
}

async function addItemsToPO(poId: string, items: POFormData["items"]) {
  for (const [_index, item] of items.entries()) {
    await purchaseOrderService.addItemToPurchaseOrder({
      purchase_order_id: poId,
      material_type_id: item.material_type_id,
      quantity_sqft: item.quantity_sqft,
      unit_cost: item.unit_cost,
      description: item.description || "",
      width: item.width,
      thickness: item.thickness,
      color: item.color,
      notes: item.description,
    })
  }
}

interface CreatePOParams {
  formData: POFormData
  suppliers: Supplier[]
  fetchData: () => Promise<void>
  setSelectedPO: (po: PurchaseOrderWithDetails | null) => void
  setIsViewDialogOpen: (open: boolean) => void
  fetchTaxDetailsForPO: (po: PurchaseOrderWithDetails) => Promise<void>
  setIsCreateDialogOpen: (v: boolean) => void
  setFormData: (v: POFormData) => void
}

export async function createPO({
  formData,
  suppliers,
  fetchData,
  setSelectedPO,
  setIsViewDialogOpen,
  fetchTaxDetailsForPO,
  setIsCreateDialogOpen,
  setFormData,
}: CreatePOParams) {
  const selectedSupplier = suppliers.find((s) => s.id === formData.supplier_id)
  const subtotal = formData.items.reduce(
    (sum, item) => sum + item.quantity_sqft * item.unit_cost,
    0
  )
  const taxCalc = await taxService.calculatePurchaseOrderTax(formData.supplier_id, subtotal)
  const shipping = selectedSupplier?.default_shipping_cost || 50

  if (taxCalc.taxLevel !== "exempt") {
    toast.info(`Tax calculated: ${taxService.formatTaxRate(taxCalc.taxRate)}`, {
      description: `Based on supplier's ${taxCalc.taxLevel === "override" ? "custom rate" : "location"}`,
    })
  }

  const poData = {
    supplier_id: formData.supplier_id,
    status: "draft" as const,
    order_date: new Date().toISOString(),
    requested_delivery_date: formData.requested_delivery_date,
    subtotal,
    tax_amount: taxCalc.taxAmount,
    shipping_cost: shipping,
    total_amount: subtotal + taxCalc.taxAmount + shipping,
    payment_terms: formData.payment_terms,
    shipping_address: formData.shipping_address,
    billing_address: formData.billing_address,
    notes: formData.notes,
    auto_generated: false,
  }

  const response = await purchaseOrderService.createPurchaseOrder(poData)
  if (!response) throw new Error("Failed to create purchase order")

  await addItemsToPO(response.id, formData.items)

  toast.success(`Purchase Order ${response.po_number} created successfully`, {
    description: "Redirecting to view your new order...",
  })

  setIsCreateDialogOpen(false)
  setFormData(getDefaultFormData())
  await fetchData()

  const newPO = await supabase
    .from("purchase_orders")
    .select(`*, supplier:suppliers(*), items:purchase_order_items(*)`)
    .eq("id", response.id)
    .single()

  if (newPO.data) {
    setSelectedPO(newPO.data)
    await fetchTaxDetailsForPO(newPO.data)
    setIsViewDialogOpen(true)
  }

  window.scrollTo({ top: 0, behavior: "smooth" })
}

interface UpdatePOParams {
  editFormData: POFormData
  editingPO: PurchaseOrderWithDetails
  suppliers: Supplier[]
  fetchData: () => Promise<void>
  setIsEditDialogOpen: (v: boolean) => void
  setEditingPO: (v: PurchaseOrderWithDetails | null) => void
  setEditFormData: (v: POFormData) => void
}

export async function updatePO({
  editFormData,
  editingPO,
  suppliers,
  fetchData,
  setIsEditDialogOpen,
  setEditingPO,
  setEditFormData,
}: UpdatePOParams) {
  const subtotal = editFormData.items.reduce(
    (sum, item) => sum + item.quantity_sqft * item.unit_cost,
    0
  )
  const taxCalc = await taxService.calculatePurchaseOrderTax(editFormData.supplier_id, subtotal)
  const selectedSupplier = suppliers.find((s) => s.id === editFormData.supplier_id)
  const shipping = selectedSupplier?.default_shipping_cost || 50

  if (taxCalc.taxLevel !== "exempt") {
    toast.info(`Tax recalculated: ${taxService.formatTaxRate(taxCalc.taxRate)}`, {
      description: `Based on supplier's ${taxCalc.taxLevel === "override" ? "custom rate" : "location"}`,
    })
  }

  const { error: updateError } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: editFormData.supplier_id,
      requested_delivery_date: editFormData.requested_delivery_date,
      subtotal,
      tax_amount: taxCalc.taxAmount,
      shipping_cost: shipping,
      total_amount: subtotal + taxCalc.taxAmount + shipping,
      payment_terms: editFormData.payment_terms,
      shipping_address: editFormData.shipping_address,
      billing_address: editFormData.billing_address,
      notes: editFormData.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", editingPO.id)

  if (updateError) throw updateError

  const { error: deleteError } = await supabase
    .from("purchase_order_items")
    .delete()
    .eq("purchase_order_id", editingPO.id)

  if (deleteError) throw deleteError

  await addItemsToPO(editingPO.id, editFormData.items)

  toast.success(`Purchase Order ${editingPO.po_number} updated successfully`)
  setIsEditDialogOpen(false)
  await fetchData()
  setEditingPO(null)
  setEditFormData(getDefaultFormData())
}
