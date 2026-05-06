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
import { cn } from "@/app/lib/utils"

export type RollActionKind = "delete" | "deplete"

interface DestructiveRollActionDialogProps {
  pendingKind: RollActionKind | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation dialog shared by the Delete and Mark-Depleted row
 * actions on the inventory list. Lifted out of `<InventoryTable>`
 * to keep that component within the `max-lines-per-function`
 * budget. Both flows route through the shared `<AlertDialog>` —
 * the previous `window.confirm` path was removed earlier in the
 * roll UX pass.
 */
export function DestructiveRollActionDialog({
  pendingKind,
  onConfirm,
  onCancel,
}: DestructiveRollActionDialogProps) {
  return (
    <AlertDialog
      open={pendingKind !== null}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pendingKind === "delete" ? "Delete this roll?" : "Mark roll as depleted?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingKind === "delete"
              ? "This permanently removes the roll from inventory. Cut history records that reference it stay intact."
              : "Marks this roll as fully used. Remaining length is set to zero and it stops appearing in available-material checks."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(
              pendingKind === "delete" && "bg-danger text-danger-foreground hover:bg-danger/90"
            )}
          >
            {pendingKind === "delete" ? "Delete roll" : "Mark depleted"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
