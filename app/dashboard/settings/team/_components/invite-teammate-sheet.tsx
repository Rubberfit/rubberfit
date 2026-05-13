"use client"

import * as React from "react"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { createInvitation } from "@/app/actions/team"

import { RoleSelectCard } from "./role-select-card"

interface InviteTeammateSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteTeammateSheet({ open, onOpenChange }: InviteTeammateSheetProps) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<"admin" | "member">("member")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSubmit = email.trim().length > 0 && EMAIL_PATTERN.test(email.trim())

  function reset() {
    setEmail("")
    setRole("member")
    setError(null)
  }

  function handleClose() {
    reset()
    onOpenChange(false)
  }

  function handleSubmit() {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await createInvitation({ email: email.trim(), role })
      if ("error" in result) {
        setError(result.error)
        return
      }
      toast.success(`Invite sent to ${email.trim()}`)
      reset()
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
        else onOpenChange(true)
      }}
    >
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold text-foreground">Invite teammate</SheetTitle>
        </SheetHeader>
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="invite-email" className="text-sm font-medium text-foreground">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="mt-4 block text-sm font-medium text-foreground">Role</Label>
              <div className="mt-2 grid grid-cols-2 gap-4">
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
            </div>
          </div>
        </div>
        <SheetFooter className="p-6 pt-0">
          <Button variant="ghost" onClick={handleClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="bg-[var(--accent-fg)] text-white hover:bg-[var(--accent-fg)]/90"
            disabled={!canSubmit || pending}
            onClick={handleSubmit}
          >
            {pending ? "Sending..." : "Send invite"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
