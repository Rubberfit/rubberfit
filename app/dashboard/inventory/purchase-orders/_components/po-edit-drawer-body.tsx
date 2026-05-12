"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { addDays, format, parseISO } from "date-fns"
import { ChevronLeft, X } from "lucide-react"
import { toast } from "sonner"

import type {
  MaterialType,
  PurchaseOrderWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { taxService } from "@/src/infrastructure/services/taxService"
import { updatePurchaseOrder } from "@/app/actions/purchase-orders"
import { Button } from "@/app/components/ui/button"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import { SheetHeader, SheetTitle } from "@/app/components/ui/sheet"

import {
  PoAddressesCard,
  PoLineItemsCard,
  PoNotesCard,
  PoOrderDetailsCard,
  PoOrderSummary,
} from "./po-form-sections"
import {
  type POFormData,
  type POFormItem,
  buildSupplierAddress,
  getDefaultFormData,
  getEmptyItem,
} from "./po-form-dialog"
import {
  type TaxDetails,
  fetchEditFormTaxDetails as fetchEditFormTaxDetailsHelper,
} from "./po-tax-helpers"
import { mapFormItems, validatePOFormData } from "./po-action-handlers"

interface PoEditDrawerBodyProps {
  po: PurchaseOrderWithDetails
  suppliers: Supplier[]
  materialTypes: MaterialType[]
  /** Called after a successful save — drawer closes itself via this. */
  onSaved: () => void | Promise<void>
  /** "Cancel" button + ChevronLeft. Drops edit mode without saving. */
  onCancel: () => void
}

/**
 * Edit body for the PO drawer — Phase 3 PR 3e ARC-206 follow-up.
 *
 * Equivalent of `/dashboard/inventory/purchase-orders/[id]/edit/page.tsx`
 * but rendered inside the right-side `<Sheet>` instead of as a
 * full page. Same form sections (`Po*Card`), same Zod-fronted
 * validation, same tax-recalc effect, same `updatePurchaseOrder`
 * server action; just sized for the drawer (header + scrollable
 * body + sheet-flush footer instead of `<PageShell>` + sticky page
 * footer).
 *
 * The `/[id]/edit` page route stays in the codebase as a
 * deep-linkable target — operators following a link from email or
 * a stale tab still resolve. But the in-app Edit buttons (drawer +
 * row dropdown) flip the drawer into edit mode instead of
 * navigating, per founder direction: "the sidebar is what we
 * want, not a page."
 */
export function PoEditDrawerBody({
  po,
  suppliers,
  materialTypes,
  onSaved,
  onCancel,
}: PoEditDrawerBodyProps) {
  const [formData, setFormData] = useState<POFormData>(() => buildInitialFormData(po, suppliers))
  const [taxDetails, setTaxDetails] = useState<TaxDetails | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)
  const [confirmRemoveItem, setConfirmRemoveItem] = useState<{
    open: boolean
    action: () => void
    index: number
  } | null>(null)

  // Stable hash over the fields that drive the tax calc — without
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
    setTaxDetails(null)
    fetchEditFormTaxDetailsHelper(formData.supplier_id, formData.items)
      .then((details) => {
        if (!cancelled) setTaxDetails(details)
      })
      .catch((error) => {
        if (!cancelled) setTaxDetails(null)
        console.error("[po/drawer-edit] tax fetch failed:", error)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.supplier_id, taxItemsKey])

  function handleConfirmRemoveItem(action: () => void, index: number) {
    setConfirmRemoveItem({ open: true, action, index })
  }

  function handleAddItem() {
    setFormData({ ...formData, items: [...formData.items, getEmptyItem()] })
  }

  function handleRemoveItem(index: number) {
    handleConfirmRemoveItem(() => {
      setFormData({
        ...formData,
        items: formData.items.filter((_, i) => i !== index),
      })
    }, index)
  }

  function handleUpdateItem(index: number, field: string, value: string | number) {
    const updatedItems = [...formData.items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setFormData({ ...formData, items: updatedItems })
  }

  async function handleSubmit() {
    if (isSavingRef.current) return
    isSavingRef.current = true
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
      await onSaved()
    } catch (error) {
      console.error("Error updating purchase order:", error)
      toast.error("Failed to update purchase order. Please try again.")
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  const isDisabled = isSaving || !formData.supplier_id || formData.items.length === 0

  return (
    <>
      <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isSaving}
            aria-label="Back to view"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div>
            <SheetTitle className="font-display text-base font-semibold tracking-tight">
              Edit PO #{po.po_number}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Update line items, addresses, and tax details.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onCancel}
          disabled={isSaving}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </SheetHeader>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <PoOrderDetailsCard formData={formData} setFormData={setFormData} suppliers={suppliers} />
        <PoLineItemsCard
          formData={formData}
          materialTypes={materialTypes}
          addItem={handleAddItem}
          removeItem={handleRemoveItem}
          updateItem={handleUpdateItem}
        />
        <PoAddressesCard formData={formData} setFormData={setFormData} />
        <PoNotesCard formData={formData} setFormData={setFormData} />
        {formData.items.length > 0 && (
          <PoOrderSummary formData={formData} suppliers={suppliers} taxDetails={taxDetails} />
        )}
      </div>

      <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={isDisabled}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>

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

function buildInitialFormData(po: PurchaseOrderWithDetails, suppliers: Supplier[]): POFormData {
  const defaults = getDefaultFormData()
  const supplier = suppliers.find((s) => s.id === po.supplier_id)
  const supplierAddress = buildSupplierAddress(supplier)
  return {
    supplier_id: po.supplier_id,
    // `new Date("YYYY-MM-DD")` parses date-only ISO strings as UTC
    // midnight, which shifts to the previous day in negative-UTC
    // offsets. `parseISO` returns local-midnight so the form shows
    // the same calendar day the operator picked.
    requested_delivery_date: po.requested_delivery_date
      ? format(parseISO(po.requested_delivery_date), "yyyy-MM-dd")
      : format(addDays(new Date(), 7), "yyyy-MM-dd"),
    payment_terms: po.payment_terms ?? defaults.payment_terms,
    shipping_address: po.shipping_address ?? supplierAddress ?? "",
    billing_address: po.billing_address ?? supplierAddress ?? "",
    notes: po.notes ?? "",
    items:
      po.items?.map(
        (item): POFormItem => ({
          // `client_id` lives only on the form row; not tied to
          // the persisted line-item id. Generated here so React's
          // row keying stays stable across reorder/remove edits.
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
  }
}
