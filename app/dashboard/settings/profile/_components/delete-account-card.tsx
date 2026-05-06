"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"

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
import { Button } from "@/app/components/ui/button"
import { FormFieldset, FormSectionHeader } from "@/app/components/ui/forms"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { useAuth } from "@/app/contexts/AuthContext"
import { profileService } from "@/src/infrastructure/services/profileService"

/**
 * Self-serve account deletion (soft-delete).
 *
 * Requires the user to type their own email in the confirmation
 * dialog — standard destructive-action guard. Server-side this
 * just flips `profiles.is_deleted` to true; the login / OAuth
 * callback routes already reject deleted profiles with a
 * "deactivated" message, so the auth row stays intact but the
 * account is unusable. Admins can restore within the 30-day DPA
 * retention window.
 */

export function DeleteAccountCard() {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  if (!user) return null

  const emailMatches = user.email.trim().toLowerCase() === confirmEmail.trim().toLowerCase()

  const handleDelete = async () => {
    if (!emailMatches || submitting) return
    setSubmitting(true)
    try {
      const result = await profileService.requestSelfDelete(user.id)
      if (!result.success) {
        toast.error("Couldn't delete account", {
          description: result.error ?? "Please contact support.",
        })
        return
      }
      toast.success("Account deleted", {
        description: "You'll be signed out and redirected to the login page.",
      })
      // Small delay so the toast is readable before the sign-out
      // redirect yanks the user away.
      setTimeout(() => {
        void signOut()
      }, 600)
    } catch (err) {
      toast.error("Couldn't delete account", {
        description: err instanceof Error ? err.message : "Unknown error",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <FormFieldset className="border-t-danger-border/60">
        <FormSectionHeader
          eyebrow="Danger zone"
          title={
            <span className="inline-flex items-center gap-2 text-danger-foreground">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              Delete account
            </span>
          }
          description="Marks your account as deleted and signs you out. Data retention follows the Data Processing Agreement — deletion from production systems within 30 days, backups within 90 days. An administrator can restore the account during that window if needed."
        />
        <div className="mt-6">
          <Button
            variant="outline"
            className="border-danger-border text-danger-foreground hover:bg-danger-bg hover:text-danger-foreground"
            onClick={() => {
              setConfirmEmail("")
              setOpen(true)
            }}
          >
            Delete my account
          </Button>
        </div>
      </FormFieldset>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks your account as deleted. You'll be signed out immediately and won't be able
              to sign in again. Your customer records and job history remain on your tenant for any
              administrator action; if you're the sole administrator, contact{" "}
              <span className="font-medium">support@arcandanchor.com</span> to close the tenant
              entirely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="delete-confirm-email" className="text-xs">
              Type your email to confirm:{" "}
              <span className="font-mono text-foreground">{user.email}</span>
            </Label>
            <Input
              id="delete-confirm-email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              placeholder={user.email}
              autoComplete="off"
              autoFocus
              className="font-mono"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={!emailMatches || submitting}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {submitting ? "Deleting…" : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
