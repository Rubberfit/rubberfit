"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { createOrganizationFromOnboarding } from "@/app/actions/billing"

interface OnboardingDialogProps {
  open: boolean
  planTier: "standard" | "pro" | "max"
}

export function OnboardingDialog({ open, planTier }: OnboardingDialogProps) {
  const router = useRouter()
  const [companyName, setCompanyName] = React.useState("")
  const [seatCount, setSeatCount] = React.useState(1)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await createOrganizationFromOnboarding({
      companyName: companyName.trim(),
      seatCount,
      planTier,
    })

    if ("error" in result) {
      setError(result.error)
      setIsSubmitting(false)
      return
    }

    router.push(`/checkout?org=${result.organizationId}`)
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-[440px] border border-[rgba(20,23,27,0.08)] bg-[var(--color-canvas,#f6f5f2)] p-0 shadow-xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Set up your workspace</DialogTitle>
          <DialogDescription>
            Step 2 of 2. Enter your company name and team size to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="p-8">
          <p className="auth-eyebrow">Step 2 of 2.</p>
          <h2 className="auth-heading">Set up your workspace.</h2>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded border border-[var(--color-signal)] bg-[var(--color-signal)]/10 px-3 py-2.5 text-sm font-medium text-[var(--color-signal)]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label htmlFor="onboarding-company-name" className="auth-input-label">
                Company name
              </label>
              <input
                id="onboarding-company-name"
                name="companyName"
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                maxLength={80}
                autoComplete="organization"
                className="auth-input-minimal"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label htmlFor="onboarding-seat-count" className="auth-input-label">
                Number of seats
              </label>
              <input
                id="onboarding-seat-count"
                name="seatCount"
                type="number"
                min={1}
                max={500}
                value={seatCount}
                onChange={(e) =>
                  setSeatCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                }
                required
                className="auth-input-minimal"
                disabled={isSubmitting}
              />
              <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
                Includes you. Add teammates after checkout.
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || companyName.trim().length === 0}
              className="auth-btn-primary mt-6 disabled:opacity-60"
            >
              {isSubmitting ? "Setting up…" : "Continue to checkout →"}
            </button>
          </form>

          <p className="mt-6 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-ink-soft)]">
            14-day trial · Card captured · No charge today.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
