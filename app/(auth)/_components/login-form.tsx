"use client"

import { useState } from "react"

import Link from "next/link"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { useAuth } from "@/app/contexts/AuthContext"

const FormSchema = z.object({
  email: z.string().email({ message: "Enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  remember: z.boolean().optional(),
})

interface LoginFormProps {
  redirectTo?: string | null
}

/**
 * Login form with an inline MFA challenge step.
 *
 * Flow:
 *   1. User submits email + password.
 *   2. `signIn` resolves. If `mfaRequired` comes back we stash the
 *      factor id and swap the UI to a code-entry step — the redirect
 *      is deferred until the code verifies.
 *   3. User enters the 6-digit TOTP code → `completeMfaChallenge`
 *      upgrades the session and routes to the dashboard.
 *   4. "Return to sign-in" resets the state without calling signOut;
 *      the aal1 session will be replaced on the next signIn.
 */
export function LoginForm({ redirectTo }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [mfaSubmitting, setMfaSubmitting] = useState(false)
  const { signIn, completeMfaChallenge } = useAuth()

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  })

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    setIsLoading(true)
    try {
      const result = await signIn(data.email, data.password, redirectTo)

      if (!result.success) {
        toast.error("Sign in failed", {
          description: result.error || "Please check your credentials and try again.",
        })
        return
      }

      if (result.mfaRequired) {
        if (!result.factorId) {
          // Defense-in-depth: signIn shouldn't return mfaRequired without
          // a factorId, but if it ever does, treat the missing factor as
          // a hard failure rather than falling through to the success
          // toast and silently letting the user past the challenge.
          toast.error("Sign in failed", {
            description:
              "Multi-factor verification could not be started. Please try again.",
          })
          return
        }
        setMfaFactorId(result.factorId)
        setMfaCode("")
        setMfaError(null)
        toast.message("Enter your authenticator code", {
          description: "Two-factor authentication is enabled on this account.",
        })
        return
      }

      toast.success("Signed in — redirecting…")
    } catch (_error) {
      toast.error("Sign in failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async () => {
    if (mfaSubmitting || !mfaFactorId) return
    const trimmed = mfaCode.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(trimmed)) {
      setMfaError("Enter the 6-digit code from your authenticator app.")
      return
    }
    setMfaSubmitting(true)
    setMfaError(null)
    try {
      const result = await completeMfaChallenge(mfaFactorId, trimmed, redirectTo)
      if (!result.success) {
        setMfaError(result.error ?? "Invalid code.")
        return
      }
      toast.success("Verified — redirecting…")
    } catch (_error) {
      setMfaError("Verification failed — please try again.")
    } finally {
      setMfaSubmitting(false)
    }
  }

  if (mfaFactorId) {
    return (
      <div>
        <span className="auth-eyebrow">Multi-factor auth</span>
        <h2 className="auth-heading">Verify identity.</h2>

        <div className="auth-field">
          <label htmlFor="login-mfa-code" className="auth-input-label">
            Authenticator code
          </label>
          <input
            id="login-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={mfaCode}
            maxLength={6}
            pattern="[0-9]*"
            disabled={mfaSubmitting}
            onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleMfaSubmit()
              }
            }}
            className="auth-mfa-input"
            autoFocus
          />
          <p className="auth-helper">Enter the code from your authenticator app.</p>
        </div>

        {mfaError ? <p className="auth-input-error">{mfaError}</p> : null}

        <button
          type="button"
          onClick={() => void handleMfaSubmit()}
          disabled={mfaSubmitting}
          className="auth-btn-primary auth-spaced"
        >
          {mfaSubmitting ? "Verifying…" : "Verify"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMfaFactorId(null)
            setMfaCode("")
            setMfaError(null)
          }}
          className="auth-link auth-link-button auth-spaced"
        >
          ← Return to sign-in
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div className="auth-field">
        <label htmlFor="login-email" className="auth-input-label">
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="auth-input-minimal"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="auth-input-error">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="auth-field">
        <label htmlFor="login-password" className="auth-input-label">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          className="auth-input-minimal"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="auth-input-error">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <div className="auth-checkbox-row">
        <input
          id="login-remember"
          type="checkbox"
          {...form.register("remember")}
          className="size-4 cursor-pointer accent-primary"
        />
        <label htmlFor="login-remember" className="auth-checkbox-label">
          Keep session active for 30 days
        </label>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="auth-btn-primary mt-6"
      >
        {isLoading ? "Signing in…" : "Sign in"}
      </button>

      <div className="auth-spaced">
        <Link href="/forgot-password" className="auth-link">
          Forgot password?
        </Link>
      </div>
    </form>
  )
}
