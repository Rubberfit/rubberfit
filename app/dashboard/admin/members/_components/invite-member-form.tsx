"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { UserPlus } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Checkbox } from "@/app/components/ui/checkbox"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { ALL_ROLES, type AppRole } from "@/src/application/permissions"
import { inviteMember } from "@/app/actions/invitations"

const DEFAULT_ROLES: readonly AppRole[] = ["member"]

export function InviteMemberForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [roles, setRoles] = React.useState<AppRole[]>([...DEFAULT_ROLES])
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const trimmedEmail = email.trim()
  const canSubmit = !isSubmitting && trimmedEmail.length > 0 && roles.length > 0

  const toggleRole = React.useCallback((role: AppRole, checked: boolean) => {
    setRoles((prev) => {
      if (checked) return prev.includes(role) ? prev : [...prev, role]
      return prev.filter((r) => r !== role)
    })
  }, [])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!canSubmit) return
      setIsSubmitting(true)
      try {
        const result = await inviteMember({ email: trimmedEmail, roles })
        if (!result.ok) {
          toast.error("Could not send invitation", { description: result.error })
          return
        }
        if (result.emailSent) {
          toast.success("Invitation sent", {
            description: `Emailed ${trimmedEmail}.`,
          })
        } else {
          toast.warning("Invitation created — email failed", {
            description: `${trimmedEmail} was added to pending. Use Resend to retry.`,
          })
        }
        setEmail("")
        setRoles([...DEFAULT_ROLES])
        router.refresh()
      } catch (error) {
        toast.error("Could not send invitation", {
          description: error instanceof Error ? error.message : "Unexpected error",
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [canSubmit, trimmedEmail, roles, router]
  )

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <header className="mb-4 flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">Invite a new member</h2>
        <p className="text-sm text-muted-foreground">
          They&apos;ll receive an email with a one-time link. The invitation expires after seven
          days.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            required
            maxLength={320}
            autoComplete="off"
          />
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">Roles</legend>
          <p className="text-xs text-muted-foreground">At least one role must be selected.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ALL_ROLES.map((role) => {
              const checked = roles.includes(role)
              return (
                <label
                  key={role}
                  htmlFor={`invite-role-${role}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm capitalize hover:bg-accent"
                >
                  <Checkbox
                    id={`invite-role-${role}`}
                    checked={checked}
                    onCheckedChange={(value) => toggleRole(role, value === true)}
                  />
                  {role}
                </label>
              )
            })}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit}>
            <UserPlus className="size-4" aria-hidden="true" />
            {isSubmitting ? "Sending…" : "Send invitation"}
          </Button>
        </div>
      </form>
    </section>
  )
}
