"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { type MaterialType } from "@/src/entities/material-type"

interface MaterialDeleteDialogProps {
  /** Material to confirm deletion of, or `null` when the dialog is closed. */
  target: MaterialType | null
  onClose: () => void
  onConfirm: (material: MaterialType) => void
}

/**
 * Destructive-action confirmation for material deletion. The
 * underlying delete is hard (FK-protected on the service); when
 * the soft-delete migration lands per the spec §2.3 resolution,
 * this copy flips to "Archive" / "Restore".
 */
export function MaterialDeleteDialog({ target, onClose, onConfirm }: MaterialDeleteDialogProps) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete material</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? (
              <>
                Delete <span className="font-medium text-foreground">{target.name}</span>? This
                cannot be undone. Existing rolls and purchase orders that reference this material
                will block the delete.
              </>
            ) : (
              "Delete this material?"
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => target && onConfirm(target)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete material
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
