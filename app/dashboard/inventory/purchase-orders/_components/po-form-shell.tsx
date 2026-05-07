"use client"

import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { type MaterialType, type Supplier } from "@/src/infrastructure/models/supabase"
import { Button } from "@/app/components/ui/button"
import { PageHeader, PageShell } from "@/app/components/patterns"

import {
  PoAddressesCard,
  PoLineItemsCard,
  PoNotesCard,
  PoOrderDetailsCard,
  PoOrderSummary,
} from "./po-form-sections"
import { type POFormData, getEmptyItem } from "./po-form-dialog"
import { type TaxDetails } from "./po-tax-helpers"

interface PoFormShellProps {
  mode: "create" | "edit"
  /** Last breadcrumb label (e.g. "New PO" or "PO-2026-001"). */
  crumbLabel: string
  title: string
  subtitle: string
  formData: POFormData
  setFormData: (data: POFormData) => void
  suppliers: Supplier[]
  materialTypes: MaterialType[]
  taxDetails: TaxDetails | null
  isSaving: boolean
  onSubmit: () => void | Promise<void>
  /** Confirm-before-discard for line item removal. */
  onConfirmRemoveItem: (action: () => void, index: number) => void
}

/**
 * Page-level shell for the PO create + edit routes — Phase 3 PR
 * 3d. Replaces the prior centered `<Dialog>` (`po-create-dialog.tsx`
 * + `po-edit-dialog.tsx`, both deleted in this PR) with a
 * full-page `<PageShell variant="form">` so the line-item table +
 * tax + addresses get the width they need. Sticky footer keeps
 * Cancel + Submit reachable while scrolling long item lists.
 */
export function PoFormShell({
  mode,
  crumbLabel,
  title,
  subtitle,
  formData,
  setFormData,
  suppliers,
  materialTypes,
  taxDetails,
  isSaving,
  onSubmit,
  onConfirmRemoveItem,
}: PoFormShellProps) {
  function handleAddItem() {
    setFormData({ ...formData, items: [...formData.items, getEmptyItem()] })
  }

  function handleRemoveItem(index: number) {
    onConfirmRemoveItem(() => {
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

  const submitLabel = mode === "create" ? "Create purchase order" : "Save changes"
  const savingLabel = mode === "create" ? "Creating…" : "Saving…"
  const isDisabled = isSaving || !formData.supplier_id || formData.items.length === 0

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Purchase Orders", href: "/dashboard/inventory/purchase-orders" },
          { label: crumbLabel },
        ]}
        title={title}
        subtitle={subtitle}
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/dashboard/inventory/purchase-orders">
              <ChevronLeft className="size-3.5" />
              Back to list
            </Link>
          </Button>
        }
      />

      <div className="space-y-6 pb-24">
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

      <div className="sticky bottom-0 -mx-6 mt-6 flex justify-end gap-2 border-t bg-card px-6 py-4 sm:-mx-8 sm:px-8">
        {isSaving ? (
          // `<Button asChild>` forwards the disabled prop to the
          // anchor child, which silently ignores it — a click
          // mid-save would still navigate away. Render a plain
          // disabled button while in flight so the operator can't
          // walk out from under the request.
          <Button variant="ghost" disabled>
            Cancel
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/dashboard/inventory/purchase-orders">Cancel</Link>
          </Button>
        )}
        <Button onClick={() => void onSubmit()} disabled={isDisabled}>
          {isSaving ? savingLabel : submitLabel}
        </Button>
      </div>
    </PageShell>
  )
}
