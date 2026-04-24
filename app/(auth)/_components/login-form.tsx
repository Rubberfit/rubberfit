"use client"

import { useState } from "react"

import Link from "next/link"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/app/components/ui/button"
import { Checkbox } from "@/app/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { useAuth } from "@/app/contexts/AuthContext"

const FormSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
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
 *   4. "Back to sign-in" resets the state without calling signOut;
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

      if (result.mfaRequired && result.factorId) {
        setMfaFactorId(result.factorId)
        setMfaCode("")
        setMfaError(null)
        toast.message("Enter your authenticator code", {
          description: "Two-factor authentication is enabled on this account.",
        })
        return
      }

      toast.success("Sign in successful!", {
        description: "Welcome back! Redirecting to dashboard...",
      })
    } catch (_error) {
      toast.error("Sign in failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleMfaSubmit = async () => {
    if (!mfaFactorId) return
    const trimmed = mfaCode.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(trimmed)) {
      setMfaError("Enter the 6-digit code from your authenticator app")
      return
    }
    setMfaSubmitting(true)
    setMfaError(null)
    try {
      const result = await completeMfaChallenge(mfaFactorId, trimmed, redirectTo)
      if (!result.success) {
        setMfaError(result.error ?? "Invalid code")
        return
      }
      toast.success("Verified — redirecting…")
    } catch (_error) {
      setMfaError("Verification failed — please try again")
    } finally {
      setMfaSubmitting(false)
    }
  }

  if (mfaFactorId) {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-mfa-code">Authenticator code</Label>
          <Input
            id="login-mfa-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleMfaSubmit()
            }}
            className="font-mono tracking-[0.4em]"
            maxLength={6}
            autoFocus
          />
          <p className="text-muted-foreground text-xs">
            Open your authenticator app and enter the current 6-digit code.
          </p>
        </div>
        {mfaError && (
          <p className="text-destructive text-xs">{mfaError}</p>
        )}
        <Button
          className="w-full"
          type="button"
          onClick={handleMfaSubmit}
          disabled={mfaSubmitting}
        >
          {mfaSubmitting ? "Verifying…" : "Verify & continue"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setMfaFactorId(null)
            setMfaCode("")
            setMfaError(null)
          }}
          className="text-muted-foreground text-sm hover:text-foreground"
        >
          ← Back to sign-in
        </button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="remember"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center">
              <FormControl>
                <Checkbox
                  id="login-remember"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="size-4"
                />
              </FormControl>
              <FormLabel
                htmlFor="login-remember"
                className="ml-1 font-medium text-muted-foreground text-sm"
              >
                Remember me for 30 days
              </FormLabel>
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Login"}
        </Button>
        <div className="text-center">
          <Link
            href="/auth/v2/forgot-password"
            className="text-muted-foreground text-sm underline-offset-4 hover:text-primary hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </Form>
  )
}
