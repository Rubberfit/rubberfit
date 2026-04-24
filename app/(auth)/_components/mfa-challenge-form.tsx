"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { useAuth } from "@/app/contexts/AuthContext"
import { authMfaService } from "@/src/infrastructure/services/authMfaService"

/**
 * Dedicated MFA challenge for the OAuth callback flow. Loads the
 * caller's primary TOTP factor on mount, prompts for the 6-digit
 * code, and hands off to `completeMfaChallenge` (same flow the
 * email+password form uses inline).
 *
 * If there's no verified factor we fall straight through to the
 * redirect — something upstream routed us here in error and
 * blocking the user would be worse than the marginal security loss.
 */

interface MfaChallengeFormProps {
  redirectTo: string | null
}

export function MfaChallengeForm({ redirectTo }: MfaChallengeFormProps) {
  const router = useRouter()
  const { completeMfaChallenge, signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    authMfaService
      .getPrimaryFactor()
      .then((factor) => {
        if (cancelled) return
        if (factor) {
          setFactorId(factor.id)
        } else {
          // No verified factor — honour the redirect straight away.
          router.replace(redirectTo ?? "/dashboard")
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load MFA factor")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [redirectTo, router])

  const handleSubmit = async () => {
    if (!factorId) return
    const trimmed = code.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeMfaChallenge(factorId, trimmed, redirectTo)
      if (!result.success) {
        setError(result.error ?? "Invalid code")
        return
      }
      toast.success("Verified — redirecting…")
    } catch (_err) {
      setError("Verification failed — please try again")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    await signOut()
  }

  if (loading) {
    return (
      <p className="text-center text-muted-foreground text-sm">
        Loading your authenticator factor…
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="mfa-challenge-code">Authenticator code</Label>
        <Input
          id="mfa-challenge-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit()
          }}
          className="font-mono tracking-[0.4em]"
          maxLength={6}
          autoFocus
        />
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button
        className="w-full"
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !factorId}
      >
        {submitting ? "Verifying…" : "Verify & continue"}
      </Button>
      <button
        type="button"
        onClick={handleCancel}
        className="w-full text-center text-muted-foreground text-sm hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  )
}
