"use client"

import { useState } from "react"
import { Building2, ClipboardCheck, Download, Edit2, Send } from "lucide-react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/app/components/ui/sheet"

import {
  AddressesCard,
  LineItemsCard,
  NotesCard,
  OrderDetailsCard,
  OrderSummaryCard,
  SupplierContactCard,
} from "./po-view-sections"
import { type TaxDetails } from "./po-tax-helpers"
import { getStatusBadge } from "./po-status-badge"

interface PoViewBodyProps {
  po: PurchaseOrderWithDetails
  taxDetails: TaxDetails | null
  onClose: () => void
  onEdit: (po: PurchaseOrderWithDetails) => void
  /**
   * Returns `true` if the status transition succeeded, `false` if
   * the request rejected. Used to gate `onClose()` below so a
   * silent failure in `updatePOStatus` doesn't dismiss the drawer
   * mid-edit.
   */
  onUpdateStatus: (poId: string, next: PurchaseOrder["status"]) => Promise<boolean>
  onDownloadPDF: (po: PurchaseOrderWithDetails) => void
}

/**
 * Read-only PO detail body — Phase 3 PR 3c. Replaces the centered
 * `<POViewDialog>` with a right `<Sheet>`-mounted body keyed on
 * `po.id` from the parent so swapping POs re-mounts fresh state
 * (the keyed pattern from PRs 3a/3b).
 */
export function PoViewBody({
  po,
  taxDetails,
  onClose,
  onEdit,
  onUpdateStatus,
  onDownloadPDF,
}: PoViewBodyProps) {
  // Disables the Edit + Submit buttons during the transition so a
  // double-click can't enqueue duplicate `pending` writes (and
  // duplicate toasts inside `updatePOStatus`).
  const [isSubmitting, setIsSubmitting] = useState(false)

  return (
    <>
      <SheetHeader className="space-y-2 border-b px-6 pt-6 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <SheetTitle className="font-semibold text-base tracking-tight">
              PO #{po.po_number}
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2 text-xs text-muted-foreground">
              <Building2 className="size-3.5" aria-hidden="true" />
              <span className="font-medium text-foreground">
                {po.supplier?.name ?? "Unknown supplier"}
              </span>
              {po.supplier?.city && po.supplier?.state && (
                <span>
                  · {po.supplier.city}, {po.supplier.state}
                </span>
              )}
            </SheetDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {getStatusBadge(po.status)}
            {po.auto_generated && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <ClipboardCheck className="size-3" aria-hidden="true" />
                Auto-generated
              </Badge>
            )}
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="space-y-5">
          <OrderDetailsCard selectedPO={po} />
          <SupplierContactCard selectedPO={po} />
          <LineItemsCard selectedPO={po} />
          <AddressesCard selectedPO={po} />
          <OrderSummaryCard selectedPO={po} selectedPOTaxDetails={taxDetails} />
          {po.notes && <NotesCard notes={po.notes} />}
        </div>
      </div>

      <div className="border-t bg-card px-6 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Close
          </Button>
          {po.status === "draft" && (
            <>
              <Button
                variant="outline"
                disabled={isSubmitting}
                onClick={() => {
                  onClose()
                  onEdit(po)
                }}
              >
                <Edit2 className="size-3.5" aria-hidden="true" />
                Edit
              </Button>
              <Button
                disabled={isSubmitting}
                onClick={async () => {
                  // `updatePOStatus` (in `use-po-actions.ts`) owns
                  // its own toast on success/failure — toasting
                  // here too would double-fire on success and
                  // (worse) green-toast even when the underlying
                  // update failed silently. The boolean return
                  // gates `onClose()` so a rejected mutation
                  // leaves the drawer open for retry.
                  setIsSubmitting(true)
                  try {
                    const ok = await onUpdateStatus(po.id, "pending")
                    if (ok) onClose()
                  } finally {
                    setIsSubmitting(false)
                  }
                }}
              >
                <Send className="size-3.5" aria-hidden="true" />
                {isSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </>
          )}
          <Button onClick={() => onDownloadPDF(po)} disabled={isSubmitting}>
            <Download className="size-3.5" aria-hidden="true" />
            Download PDF
          </Button>
        </div>
      </div>
    </>
  )
}
