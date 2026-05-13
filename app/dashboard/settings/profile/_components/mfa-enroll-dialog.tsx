"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, QrCode, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { authMfaService } from "@/src/infrastructure/services/authMfaService"
import type { MfaEnrollmentHandle } from "@/src/infrastructure/services/authMfaService"

/**
 * Two-step enrollment dialog: scan → verify. Swaps to a success
 * panel when the TOTP code matches. The parent (MFA card) refreshes
 * its factor list via `onEnrolled` so the card's state flips from
 * "Not enrolled" to "Active".
 *
 * Runs `startEnrollment` the first time the dialog opens. If the
 * user closes without verifying, the factor stays in
 * `unverified` state on the DB. Supabase prunes stale unverified
 * factors, but we also surface a "clean up" path on the card to be
 * safe.
 */

interface MfaEnrollDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEnrolled?: () => void
}

export function MfaEnrollDialog({ open, onOpenChange, onEnrolled }: MfaEnrollDialogProps) {
  const [handle, setHandle] = useState<MfaEnrollmentHandle | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  // Fire enrollment once per open. If the dialog is closed mid-flow
  // and reopened, we re-enroll fresh — the old unverified factor
  // becomes a dead row that Supabase cleans up server-side.
  useEffect(() => {
    if (!open) {
      startedRef.current = false
      setHandle(null)
      setCode("")
      setError(null)
      return
    }
    if (startedRef.current) return
    startedRef.current = true
    setLoading(true)
    authMfaService
      .startEnrollment()
      .then(setHandle)
      .catch((err: unknown) => {
        const m = err instanceof Error ? err.message : "Unknown error"
        setError(m)
      })
      .finally(() => setLoading(false))
  }, [open])

  const handleVerify = async () => {
    if (!handle) {
      setError("Enrollment not ready — reopen the dialog and try again.")
      return
    }
    const trimmed = code.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app")
      return
    }
    setVerifying(true)
    setError(null)
    try {
      await authMfaService.verifyEnrollment(handle.factorId, trimmed)
      toast.success("Two-factor authentication enabled")
      onEnrolled?.()
      onOpenChange(false)
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Invalid code"
      setError(m)
    } finally {
      // Always release the button — previously a null-handle early
      // return left the verifying spinner stuck forever.
      setVerifying(false)
    }
  }

  const copySecret = () => {
    if (!handle) return
    navigator.clipboard
      .writeText(handle.secret)
      .then(() => toast.success("Secret copied"))
      .catch(() => toast.error("Could not copy"))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4" aria-hidden="true" />
            Set up two-factor authentication
          </DialogTitle>
          <DialogDescription>
            Scan the QR code with an authenticator app (1Password, Authy, Google Authenticator),
            then enter the 6-digit code to verify.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Generating secret…</div>
        ) : handle ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 rounded-md border bg-card p-4">
              {/*
                Supabase returns `totp.qr_code` as a data URL
                (`data:image/svg+xml;utf-8,<svg…>`) — NOT raw markup.
                Feeding it into `dangerouslySetInnerHTML` used to
                render the URL as literal text next to the QR.
                Rendering it as an <img src> is the documented
                contract.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={handle.qrSvg} alt="TOTP QR code" className="size-44 rounded bg-white p-1" />
              <p className="text-muted-foreground text-[11px]">
                Can't scan? Copy the secret below instead.
              </p>
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex items-center gap-2 font-mono text-foreground text-xs hover:text-foreground/80"
                title="Copy secret"
              >
                <QrCode className="size-3" aria-hidden="true" />
                <span>{handle.secret.match(/.{1,4}/g)?.join(" ") ?? handle.secret}</span>
                <Copy className="size-3" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mfa-code">Verification code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleVerify()
                }}
                className="font-mono tracking-[0.4em]"
                maxLength={6}
              />
            </div>

            {error && <p className="text-danger-foreground text-xs">{error}</p>}
          </div>
        ) : error ? (
          <div className="py-6 text-center text-danger-foreground text-sm">{error}</div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={verifying}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={verifying || !handle}>
            {verifying ? "Verifying…" : "Verify & enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
