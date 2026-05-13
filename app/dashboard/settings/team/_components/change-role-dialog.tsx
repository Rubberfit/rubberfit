"use client"

import * as React from "react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"

import { RoleSelectCard } from "./role-select-card"

interface ChangeRoleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberId: string | null
  memberName: string | null
  currentRole: "admin" | "member" | null
}

export function ChangeRoleDialog({
  open,
  onOpenChange,
  memberId,
  memberName,
  currentRole,
}: ChangeRoleDialogProps) {
  const [role, setRole] = React.useState<"admin" | "member">("member")
  const [pending, startTransition] = useTransition()

  React.useEffect(() => {
    if (currentRole === "admin" || currentRole === "member") setRole(currentRole)
  }, [currentRole, open])

  function handleSave() {
    if (!memberId) return
    startTransition(async () => {
      // Role change is a PR 6 follow-up — the server-side updateMember endpoint
      // ships in the next iteration. The dialog is in place so the UI surface
      // is complete; until then we no-op with a toast so testers see the path
      // is reachable.
      toast(`Role change to ${role} is not yet implemented.`)
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">Change role</DialogTitle>
        </DialogHeader>
        <p className="mt-2 text-sm text-muted-foreground">
          Update the role for {memberName ?? "this teammate"}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <RoleSelectCard
            role="admin"
            title="Admin"
            description="Can manage seats, invites, and billing."
            selected={role === "admin"}
            onSelect={() => setRole("admin")}
          />
          <RoleSelectCard
            role="member"
            title="Member"
            description="Can view and edit project data."
            selected={role === "member"}
            onSelect={() => setRole("member")}
          />
        </div>
        <DialogFooter className="mt-6 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
            onClick={handleSave}
            disabled={pending}
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
