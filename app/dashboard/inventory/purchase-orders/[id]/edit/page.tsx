"use client"

import { useEffect, useMemo, useRef, useState, use } from "react"
import { useRouter } from "next/navigation"
import { addDays, format, parseISO } from "date-fns"
import { toast } from "sonner"

import type {
  MaterialType,
  PurchaseOrderWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { taxService } from "@/src/infrastructure/services/taxService"
import { updatePurchaseOrder } from "@/app/actions/purchase-orders"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"

import { PoFormShell } from "../../_components/po-form-shell"
import {
  type POFormData,
  type POFormItem,
  buildSupplierAddress,
  getDefaultFormData,
  getEmptyItem,
} from "../../_components/po-form-dialog"
import {
  type TaxDetails,
  fetchEditFormTaxDetails as fetchEditFormTaxDetailsHelper,
} from "../../_components/po-tax-helpers"
import { mapFormItems, validatePOFormData } from "../../_components/po-action-handlers"

interface EditPoRouteProps {
  params: Promise<{ id: string }>
}

export default function EditPurchaseOrderPage({ params }: EditPoRouteProps) {
  const { id } = use(params)
  const router = useRouter()

  const [po, setPo] = useState<PurchaseOrderWithDetails | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [formData, setFormData] = useState<POFormData>(getDefaultFormData())
  const [taxDetails, setTaxDetails] = useState<TaxDetails | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Synchronous re-entry guard. State setters don't flip
  // synchronously, so a fast double-click that fires two submits
  // back-to-back inside the same tick would both read
  // `isSaving === false` and both kick off `updatePurchaseOrder` —
  // doubling the side effects. The ref flips on the same line as
  // the first guard check, so the second submit short-circuits.
  const isSavingRef = useRef(false)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{
    open: boolean
    action: () => void
    index: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      setLoadError(null)
      try {
        const [poData, suppliersData, materialsData] = await Promise.all([
          purchaseOrderService.getPurchaseOrderById(id),
          supplierService.getActiveSuppliers(),
          materialTypeRepository.getAll(),
        ])
        if (cancelled) return
        if (!poData) {
          setLoadError("Purchase order not found")
          return
        }
        setPo(poData)
        setSuppliers(suppliersData)
        setMaterialTypes(materialsData)

        const supplier = suppliersData.find((s) => s.id === poData.supplier_id)
        const supplierAddress = buildSupplierAddress(supplier)
        setFormData({
          supplier_id: poData.supplier_id,
          // `new Date("YYYY-MM-DD")` parses date-only ISO strings
          // as UTC midnight, which shifts to the previous day in
          // negative UTC offsets (US time zones). `parseISO`
          // returns the local-midnight Date instead so the form
          // shows the same calendar day the operator picked.
          requested_delivery_date: poData.requested_delivery_date
            ? format(parseISO(poData.requested_delivery_date), "yyyy-MM-dd")
            : format(addDays(new Date(), 7), "yyyy-MM-dd"),
          payment_terms: poData.payment_terms ?? "Net 30",
          shipping_address: poData.shipping_address ?? supplierAddress ?? "",
          billing_address: poData.billing_address ?? supplierAddress ?? "",
          notes: poData.notes ?? "",
          items:
            poData.items?.map(
              (item): POFormItem => ({
                // `client_id` lives only on the form row; it isn't
                // tied to the persisted line-item id. Generated
                // here so React's row keying stays stable across
                // reorder/remove edits.
                client_id: getEmptyItem().client_id,
                material_type_id: item.material_type_id ?? "",
                description: item.description ?? "",
                width: item.width ?? undefined,
                length: undefined,
                thickness: item.thickness ?? undefined,
                color: item.color ?? "",
                quantity_sqft: item.quantity_sqft,
                unit_cost: item.unit_cost,
              })
            ) ?? [],
        })
      } catch (error) {
        console.error("[po/edit] failed to load PO:", error)
        if (!cancelled) setLoadError("Failed to load purchase order")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  // Derive a stable hash over the fields that actually affect the
  // tax calc (material + quantity + cost). Without this, the
  // `formData.items` array reference churns on every keystroke
  // into any line-item input — which would re-fire the tax fetch
  // per character. Stringifying the relevant subset gives the
  // effect a stable identity that only invalidates on real edits.
  const taxItemsKey = useMemo(
    () =>
      formData.items
        .map((i) => `${i.material_type_id}:${i.quantity_sqft}:${i.unit_cost}`)
        .join("|"),
    [formData.items]
  )

  useEffect(() => {
    let cancelled = false
    // Drop the previous tax state up-front so a slow refetch
    // can't leave the operator looking at the prior supplier's
    // numbers while they're editing — better to show "—" briefly
    // than wrong figures.
    setTaxDetails(null)
    fetchEditFormTaxDetailsHelper(formData.supplier_id, formData.items)
      .then((details) => {
        if (cancelled) return
        setTaxDetails(details)
      })
      .catch((error) => {
        if (!cancelled) setTaxDetails(null)
        console.error("[po/edit] tax fetch failed:", error)
      })
    return () => {
      cancelled = true
    }
    // `taxItemsKey` is the stable hash; `formData.items` is read
    // inside but its identity doesn't gate the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.supplier_id, taxItemsKey])

  function handleConfirmRemoveItem(action: () => void, index: number) {
    setConfirmRemoveItem({ open: true, action, index })
  }

  async function handleSubmit() {
    // Synchronous re-entry guard — see `isSavingRef` doc above.
    if (isSavingRef.current) return
    isSavingRef.current = true
    if (!po) {
      isSavingRef.current = false
      return
    }
    // Per-item validation (material + quantities + cost) — the
    // `PoFormShell` disabled state only covers supplier + empty
    // items, not per-item validity. Without this, an item with
    // missing material_type_id or zero qty/cost would slip past
    // and the server action would reject with a generic Zod error.
    if (!validatePOFormData(formData)) {
      isSavingRef.current = false
      return
    }
    setIsSaving(true)
    try {
      const selectedSupplier = suppliers.find((s) => s.id === formData.supplier_id)
      const { taxCalculation } = await updatePurchaseOrder({
        purchaseOrderId: po.id,
        supplierId: formData.supplier_id,
        requestedDeliveryDate: formData.requested_delivery_date,
        paymentTerms: formData.payment_terms,
        shippingAddress: formData.shipping_address,
        billingAddress: formData.billing_address,
        notes: formData.notes,
        shippingCost: selectedSupplier?.default_shipping_cost,
        items: mapFormItems(formData.items),
      })
      if (taxCalculation.taxLevel !== "exempt") {
        toast.info(`Tax recalculated: ${taxService.formatTaxRate(taxCalculation.taxRate)}`, {
          description: `Based on supplier's ${
            taxCalculation.taxLevel === "override" ? "custom rate" : "location"
          }`,
        })
      }
      toast.success(`Purchase Order ${po.po_number} updated successfully`)
      router.push("/dashboard/inventory/purchase-orders")
    } catch (error) {
      console.error("Error updating purchase order:", error)
      toast.error("Failed to update purchase order. Please try again.")
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading purchase order…
      </div>
    )
  }

  if (loadError !== null || !po) {
    return (
      <div className="mx-auto max-w-md space-y-3 py-20 text-center">
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {loadError !== null && loadError !== "" ? loadError : "Purchase order not found"}
        </h2>
        <p className="text-sm text-muted-foreground">
          The PO may have been cancelled or moved. Return to the list to confirm.
        </p>
      </div>
    )
  }

  return (
    <>
      <PoFormShell
        mode="edit"
        crumbLabel={`PO #${po.po_number}`}
        title={`Edit PO #${po.po_number}`}
        subtitle="Update line items, addresses, and tax details for this purchase order."
        formData={formData}
        setFormData={setFormData}
        suppliers={suppliers}
        materialTypes={materialTypes}
        taxDetails={taxDetails}
        isSaving={isSaving}
        onSubmit={handleSubmit}
        onConfirmRemoveItem={handleConfirmRemoveItem}
      />
      <ConfirmationDialog
        open={confirmRemoveItem?.open ?? false}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveItem(null)
        }}
        onConfirm={() => {
          confirmRemoveItem?.action()
          setConfirmRemoveItem(null)
        }}
        title="Remove item?"
        description={`Are you sure you want to remove Item #${(confirmRemoveItem?.index ?? 0) + 1} from this purchase order?`}
        variant="warning"
      />
    </>
  )
}
