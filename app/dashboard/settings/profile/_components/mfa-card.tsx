"use client"

import { useCallback, useEffect, useState } from "react"
import { ShieldCheck, ShieldOff, Trash2 } from "lucide-react"
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
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card"
import { authMfaService, type MfaFactor } from "@/src/infrastructure/services/authMfaService"
import { cn } from "@/app/lib/utils"

import { MfaEnrollDialog } from "./mfa-enroll-dialog"

/**
 * Two-factor authentication card. Lives under
 * `/dashboard/settings/profile` below the password Security card.
 * Shows whether MFA is enrolled, lets the user add a factor or
 * remove one, and flags unverified factors (left over from an
 * abandoned enrollment).
 *
 * Uses `authMfaService` (Supabase GoTrue TOTP under the hood). No
 * server-side plumbing needed — the browser calls the auth SDK
 * directly against the caller's session.
 */

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}

export function MfaCard() {
  const [factors, setFactors] = useState<MfaFactor[]>([])
  const [loading, setLoading] = useState(true)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [pendingUnenroll, setPendingUnenroll] = useState<MfaFactor | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await authMfaService.listFactors()
      setFactors(list)
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to load MFA factors", { description: m })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const verified = factors.filter((f) => f.status === "verified")
  const unverified = factors.filter((f) => f.status === "unverified")
  const enabled = verified.length > 0

  const confirmUnenroll = async () => {
    if (!pendingUnenroll) return
    try {
      await authMfaService.unenroll(pendingUnenroll.id)
      toast.success(
        pendingUnenroll.status === "verified"
          ? "Two-factor authentication disabled"
          : "Removed unverified factor"
      )
      setPendingUnenroll(null)
      void load()
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to remove factor", { description: m })
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {enabled ? (
                  <ShieldCheck className="size-5 text-success-foreground" aria-hidden="true" />
                ) : (
                  <ShieldOff className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
                Two-factor authentication
              </CardTitle>
              <CardDescription>
                {enabled
                  ? "An authenticator code is required on every sign-in."
                  : "Add an authenticator app as a second factor for sign-in."}
              </CardDescription>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs capitalize",
                enabled
                  ? "border-success-border bg-success-bg text-success-foreground"
                  : "border-border-subtle bg-muted text-muted-foreground"
              )}
            >
              {enabled ? "Active" : "Not enrolled"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-4 text-center text-muted-foreground text-sm">
              Loading factors…
            </div>
          ) : (
            <>
              {verified.length > 0 && (
                <ul className="divide-y divide-border-subtle rounded-md border">
                  {verified.map((f) => (
                    <li
                      key={f.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <ShieldCheck
                          className="size-4 text-success-foreground"
                          aria-hidden="true"
                        />
                        <div>
                          <p className="font-medium text-foreground text-sm">
                            {f.friendlyName ?? "Authenticator app"}
                          </p>
                          <p className="text-muted-foreground text-[11px]">
                            TOTP · added {formatDate(f.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-foreground hover:text-danger-foreground"
                        onClick={() => setPendingUnenroll(f)}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {unverified.length > 0 && (
                <div className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-warning-foreground text-xs">
                  {unverified.length} pending setup{unverified.length === 1 ? "" : "s"}{" "}
                  left unverified. These don't protect the account — finish enrolling or remove
                  them.
                  <div className="mt-2 flex flex-wrap gap-2">
                    {unverified.map((f) => (
                      <Button
                        key={f.id}
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingUnenroll(f)}
                      >
                        Remove pending
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button onClick={() => setEnrollOpen(true)}>
                  <ShieldCheck className="size-3.5" />
                  {enabled ? "Add another device" : "Enable MFA"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <MfaEnrollDialog
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        onEnrolled={() => void load()}
      />

      <AlertDialog
        open={pendingUnenroll !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnenroll(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingUnenroll?.status === "verified"
                ? "Disable two-factor authentication?"
                : "Remove pending factor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingUnenroll?.status === "verified"
                ? "Your account will no longer require a verification code at sign-in. You can re-enroll at any time."
                : "This clears an in-progress setup. You'll need to start over if you want to enable MFA."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnenroll}
              className={cn(
                pendingUnenroll?.status === "verified" &&
                  "bg-danger text-danger-foreground hover:bg-danger/90"
              )}
            >
              {pendingUnenroll?.status === "verified" ? "Disable MFA" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
