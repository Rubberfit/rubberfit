"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import type { MaterialType, Supplier } from "@/src/infrastructure/models/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { taxService } from "@/src/infrastructure/services/taxService"
import { createPurchaseOrder } from "@/app/actions/purchase-orders"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"

import { PoFormShell } from "../_components/po-form-shell"
import { type POFormData, getDefaultFormData, getEmptyItem } from "../_components/po-form-dialog"
import {
  type TaxDetails,
  fetchCreateFormTaxDetails as fetchCreateFormTaxDetailsHelper,
} from "../_components/po-tax-helpers"
import { mapFormItems, validatePOFormData } from "../_components/po-action-handlers"

function NewPurchaseOrderPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [formData, setFormData] = useState<POFormData>(getDefaultFormData())
  const [taxDetails, setTaxDetails] = useState<TaxDetails | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{
    open: boolean
    action: () => void
    index: number
  } | null>(null)

  // Job-prefill bridge: when the operator came from a job
  // sufficiency panel's "Create PO" deep-link
  // (`?job_id=<id>&material=<name>&shortfall_sqft=<n>`), the form
  // pre-fills with a matching line item + stores the source job
  // id so submit can stamp `purchase_orders.job_id` for the job
  // drawer's linked-POs panel. One-shot — strips the params on
  // first apply.
  const jobIdParam = searchParams.get("job_id")
  const materialParam = searchParams.get("material")
  const shortfallParam = searchParams.get("shortfall_sqft")
  const sourceJobIdRef = useRef<string | null>(jobIdParam)
  const prefillAppliedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [suppliersData, materialsData] = await Promise.all([
        supplierService.getActiveSuppliers(),
        materialTypeRepository.getAll(),
      ])
      if (cancelled) return
      setSuppliers(suppliersData)
      setMaterialTypes(materialsData)
    }
    void load().catch((error) => {
      console.error("[po/new] failed to load form deps:", error)
      toast.error("Couldn't load form data — please refresh")
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Apply the job-prefill once material types are loaded so the
  // material name → id lookup resolves.
  useEffect(() => {
    if (prefillAppliedRef.current) return
    if (!jobIdParam) return
    if (materialTypes.length === 0) return
    prefillAppliedRef.current = true

    const shortfall = Number(shortfallParam)
    const matchedMaterialType = materialTypes.find(
      (mt) => (materialParam ?? "").trim().toLowerCase() === (mt.name ?? "").trim().toLowerCase()
    )
    const hasValidShortfall = Number.isFinite(shortfall) && shortfall > 0

    if (!materialParam || !matchedMaterialType || !hasValidShortfall) {
      // Don't half-prefill (empty material_type_id + zero qty)
      // and pretend the deep-link succeeded — that creates a
      // misleading partially-linked draft. Surface the failure,
      // strip the params so a refresh doesn't replay, and let the
      // operator start from a clean form.
      toast.error("Couldn't prefill this PO from the job shortfall.", {
        description: matchedMaterialType
          ? `Shortfall amount missing or invalid (got "${shortfallParam ?? ""}")`
          : `Material "${materialParam ?? ""}" doesn't match a known material type`,
      })
      router.replace("/dashboard/inventory/purchase-orders/new")
      return
    }

    setFormData((prev) => ({
      ...prev,
      items: [
        {
          ...getEmptyItem(),
          material_type_id: matchedMaterialType.id,
          description: `Job shortfall: ${materialParam}`,
          quantity_sqft: Number(shortfall.toFixed(2)),
        },
      ],
    }))
    sourceJobIdRef.current = jobIdParam
    toast.message("PO prefilled from job shortfall.", {
      description: `${materialParam} · ${shortfall.toFixed(1)} sqft`,
    })
    router.replace("/dashboard/inventory/purchase-orders/new")
  }, [jobIdParam, materialParam, shortfallParam, materialTypes, router])

  // Stable hash over the fields that affect the tax calc — without
  // this, `formData.items` array identity churns on every keystroke
  // into any line-item input and the tax fetch fires per character.
  const taxItemsKey = useMemo(
    () =>
      formData.items
        .map((i) => `${i.material_type_id}:${i.quantity_sqft}:${i.unit_cost}`)
        .join("|"),
    [formData.items]
  )

  useEffect(() => {
    let cancelled = false
    fetchCreateFormTaxDetailsHelper(formData.supplier_id, formData.items)
      .then((details) => {
        if (cancelled) return
        setTaxDetails(details)
      })
      .catch((error) => {
        console.error("[po/new] tax fetch failed:", error)
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
    // Per-item validation (material + quantities + cost) — the
    // `PoFormShell` disabled state only covers supplier + empty
    // items, not per-item validity. Without this, an item with
    // missing material_type_id or zero qty/cost would slip past
    // and the server action would reject with a generic Zod error.
    if (!validatePOFormData(formData)) return
    setIsSaving(true)
    try {
      const selectedSupplier = suppliers.find((s) => s.id === formData.supplier_id)
      const { purchaseOrder, taxCalculation } = await createPurchaseOrder({
        supplierId: formData.supplier_id,
        requestedDeliveryDate: formData.requested_delivery_date,
        paymentTerms: formData.payment_terms,
        shippingAddress: formData.shipping_address,
        billingAddress: formData.billing_address,
        notes: formData.notes,
        shippingCost: selectedSupplier?.default_shipping_cost,
        items: mapFormItems(formData.items),
        jobId: sourceJobIdRef.current ?? undefined,
      })
      if (taxCalculation.taxLevel !== "exempt") {
        toast.info(`Tax calculated: ${taxService.formatTaxRate(taxCalculation.taxRate)}`, {
          description: `Based on supplier's ${
            taxCalculation.taxLevel === "override" ? "custom rate" : "location"
          }`,
        })
      }
      toast.success(`Purchase Order ${purchaseOrder.po_number} created successfully`)
      router.push("/dashboard/inventory/purchase-orders")
    } catch (error) {
      console.error("Error creating purchase order:", error)
      toast.error("Failed to create purchase order. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <PoFormShell
        mode="create"
        crumbLabel="New PO"
        title="New purchase order"
        subtitle="Create a new purchase order for materials."
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

export default function NewPurchaseOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewPurchaseOrderPageInner />
    </Suspense>
  )
}
