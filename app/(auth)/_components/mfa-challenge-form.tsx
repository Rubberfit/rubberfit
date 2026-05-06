"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
          router.replace(redirectTo ?? "/dashboard")
        }
      })
      .catch(() => {
        if (!cancelled) setError("Could not load MFA factor.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [redirectTo, router])

  const handleSubmit = async () => {
    if (submitting || !factorId) return
    const trimmed = code.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await completeMfaChallenge(factorId, trimmed, redirectTo)
      if (!result.success) {
        setError(result.error ?? "Invalid code.")
        return
      }
      toast.success("Verified — redirecting…")
    } catch (_err) {
      setError("Verification failed — please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    await signOut()
  }

  if (loading) {
    return <p className="auth-helper">Loading your authenticator factor…</p>
  }

  return (
    <div>
      <div className="auth-field">
        <label htmlFor="mfa-challenge-code" className="auth-input-label">
          Authenticator code
        </label>
        <input
          id="mfa-challenge-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          maxLength={6}
          pattern="[0-9]*"
          disabled={submitting}
          onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              void handleSubmit()
            }
          }}
          className="auth-mfa-input"
          autoFocus
        />
        <p className="auth-helper">Enter the code from your authenticator app to finish signing in.</p>
      </div>

      {error ? <p className="auth-input-error">{error}</p> : null}

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting || !factorId}
        className="auth-btn-primary auth-spaced"
      >
        {submitting ? "Verifying…" : "Verify"}
      </button>

      <div className="auth-spaced-row-center">
        <button
          type="button"
          onClick={handleCancel}
          className="auth-link auth-link-button"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
