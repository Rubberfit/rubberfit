"use client"

import { Sheet, SheetContent } from "@/app/components/ui/sheet"
import {
  type MaterialType,
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"

import { PoEditDrawerBody } from "./po-edit-drawer-body"
import { PoViewBody } from "./po-view-body"
import { type TaxDetails } from "./po-tax-helpers"

export type PoDrawerMode = "view" | "edit"

interface PoViewDrawerProps {
  po: PurchaseOrderWithDetails | null
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: PoDrawerMode
  /** Flips the drawer between read-only view and inline edit. */
  onModeChange: (mode: PoDrawerMode) => void
  taxDetails: TaxDetails | null
  /** Catalog of suppliers — needed by the edit body's form. */
  suppliers: Supplier[]
  /** Catalog of material types — needed by the edit body's line items. */
  materialTypes: MaterialType[]
  /**
   * Fired after a successful in-drawer edit save. Caller is
   * expected to refresh the PO list and close the drawer.
   */
  onSaved: () => void | Promise<void>
  /**
   * Returns `true` on success, `false` on rejection — the drawer
   * Submit button gates `onClose()` on the truthy result.
   */
  onUpdateStatus: (poId: string, next: PurchaseOrder["status"]) => Promise<boolean>
  onDownloadPDF: (po: PurchaseOrderWithDetails) => void
}

/**
 * Right-docked PO drawer — view + edit in one Sheet. Phase 3 PR
 * 3c shipped the read-only view path (`PoViewBody`); Phase 3 PR 3e
 * adds an in-place edit mode (`PoEditDrawerBody`) per ARC-206. The
 * drawer is the canonical edit surface — clicking Edit anywhere
 * (drawer body or row dropdown) flips this surface into edit mode
 * instead of navigating to `/[id]/edit`.
 *
 * The body is keyed on `po.id + mode` so swapping PO targets or
 * flipping modes re-mounts the body with fresh state instead of
 * carrying stale form values from the previous selection.
 */
export function PoViewDrawer({
  po,
  open,
  onOpenChange,
  mode,
  onModeChange,
  taxDetails,
  suppliers,
  materialTypes,
  onSaved,
  onUpdateStatus,
  onDownloadPDF,
}: PoViewDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        {po && mode === "view" && (
          <PoViewBody
            key={`view-${po.id}`}
            po={po}
            taxDetails={taxDetails}
            onClose={() => onOpenChange(false)}
            onEdit={() => onModeChange("edit")}
            onUpdateStatus={onUpdateStatus}
            onDownloadPDF={onDownloadPDF}
          />
        )}
        {po && mode === "edit" && (
          <PoEditDrawerBody
            key={`edit-${po.id}`}
            po={po}
            suppliers={suppliers}
            materialTypes={materialTypes}
            onSaved={onSaved}
            onCancel={() => onModeChange("view")}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
