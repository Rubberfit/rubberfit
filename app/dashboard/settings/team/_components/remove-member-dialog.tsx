"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { deactivateMember } from "@/app/actions/team"

interface RemoveMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string | null
  memberName: string | null
}

export function RemoveMemberDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
}: RemoveMemberDialogProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleRemove() {
    if (!memberId) return
    startTransition(async () => {
      const result = await deactivateMember({ memberId })
      if ("error" in result) {
        toast.error(result.error)
        return
      }
      toast.success("Teammate removed from workspace")
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Remove teammate
          </DialogTitle>
        </DialogHeader>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to remove {memberName ?? "this teammate"} from the workspace? They
          will lose access immediately.
        </p>
        <DialogFooter className="mt-6 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove} disabled={pending}>
            {pending ? "Removing..." : "Remove from workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
