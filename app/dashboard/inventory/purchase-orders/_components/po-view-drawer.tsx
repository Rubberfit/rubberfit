"use client"

import { Sheet, SheetContent } from "@/app/components/ui/sheet"
import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"

import { PoViewBody } from "./po-view-body"
import { type TaxDetails } from "./po-tax-helpers"

interface PoViewDrawerProps {
  po: PurchaseOrderWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  taxDetails: TaxDetails | null
  onEdit: (po: PurchaseOrderWithDetails) => void
  /**
   * Returns `true` on success, `false` on rejection — the drawer
   * Submit button gates `onClose()` on the truthy result.
   */
  onUpdateStatus: (poId: string, next: PurchaseOrder["status"]) => Promise<boolean>
  onDownloadPDF: (po: PurchaseOrderWithDetails) => void
}

/**
 * Right-docked read-only PO drawer — Phase 3 PR 3c. Replaces
 * `<POViewDialog>` (deleted in this PR). Slim shell that wraps
 * `<Sheet>` + `<PoViewBody>` keyed on `po.id` so swapping PO
 * targets re-mounts the body fresh instead of carrying stale
 * tax-detail state from the previous selection.
 */
export function PoViewDrawer({
  po,
  open,
  onOpenChange,
  taxDetails,
  onEdit,
  onUpdateStatus,
  onDownloadPDF,
}: PoViewDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        {po && (
          <PoViewBody
            key={po.id}
            po={po}
            taxDetails={taxDetails}
            onClose={() => onOpenChange(false)}
            onEdit={onEdit}
            onUpdateStatus={onUpdateStatus}
            onDownloadPDF={onDownloadPDF}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
