import {
  supabase,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { taxService } from "@/src/infrastructure/services/taxService"
import type { ICreatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/create-purchase-order.use-case"
import type { IUpdatePurchaseOrderUseCase } from "@/src/application/use-cases/purchase-orders/update-purchase-order.use-case"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
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

function mapFormItems(items: POFormData["items"]) {
  return items.map((item) => ({
    materialTypeId: item.material_type_id,
    description: item.description || "",
    quantitySqft: item.quantity_sqft,
    unitCost: item.unit_cost,
    width: item.width,
    thickness: item.thickness,
    color: item.color,
    notes: item.description,
  }))
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
  /**
   * Set when the operator came from a job's sufficiency panel's
   * "Create PO" deep-link — the resulting PO's `job_id` column
   * gets stamped so the job's linked-POs panel can pick it up.
   */
  jobId?: string
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
  jobId,
}: CreatePOParams) {
  const selectedSupplier = suppliers.find((s) => s.id === formData.supplier_id)

  const useCase = resolveUseCase<ICreatePurchaseOrderUseCase>(TOKENS.ICreatePurchaseOrderUseCase)
  const { purchaseOrder, taxCalculation } = await useCase.execute({
    supplierId: formData.supplier_id,
    requestedDeliveryDate: formData.requested_delivery_date,
    paymentTerms: formData.payment_terms,
    shippingAddress: formData.shipping_address,
    billingAddress: formData.billing_address,
    notes: formData.notes,
    shippingCost: selectedSupplier?.default_shipping_cost,
    items: mapFormItems(formData.items),
    jobId,
  })

  if (taxCalculation.taxLevel !== "exempt") {
    toast.info(`Tax calculated: ${taxService.formatTaxRate(taxCalculation.taxRate)}`, {
      description: `Based on supplier's ${taxCalculation.taxLevel === "override" ? "custom rate" : "location"}`,
    })
  }

  toast.success(`Purchase Order ${purchaseOrder.po_number} created successfully`, {
    description: "Redirecting to view your new order...",
  })

  setIsCreateDialogOpen(false)
  setFormData(getDefaultFormData())
  await fetchData()

  const fullPO = await purchaseOrderService.getPurchaseOrderById(purchaseOrder.id)
  if (fullPO) {
    setSelectedPO(fullPO)
    await fetchTaxDetailsForPO(fullPO)
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
  const selectedSupplier = suppliers.find((s) => s.id === editFormData.supplier_id)

  const useCase = resolveUseCase<IUpdatePurchaseOrderUseCase>(TOKENS.IUpdatePurchaseOrderUseCase)
  const { taxCalculation } = await useCase.execute({
    purchaseOrderId: editingPO.id,
    supplierId: editFormData.supplier_id,
    requestedDeliveryDate: editFormData.requested_delivery_date,
    paymentTerms: editFormData.payment_terms,
    shippingAddress: editFormData.shipping_address,
    billingAddress: editFormData.billing_address,
    notes: editFormData.notes,
    shippingCost: selectedSupplier?.default_shipping_cost,
    items: mapFormItems(editFormData.items),
  })

  if (taxCalculation.taxLevel !== "exempt") {
    toast.info(`Tax recalculated: ${taxService.formatTaxRate(taxCalculation.taxRate)}`, {
      description: `Based on supplier's ${taxCalculation.taxLevel === "override" ? "custom rate" : "location"}`,
    })
  }

  toast.success(`Purchase Order ${editingPO.po_number} updated successfully`)
  setIsEditDialogOpen(false)
  await fetchData()
  setEditingPO(null)
  setEditFormData(getDefaultFormData())
}
