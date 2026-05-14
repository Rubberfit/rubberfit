"use client"

import { useState, useTransition } from "react"

import { createBillingPortalSession } from "@/app/actions/billing"

/**
 * Stripe-hosted Portal sessions live at `billing.stripe.com`. We validate
 * before navigating so a future refactor or compromised upstream can't
 * turn the server action's URL field into an open redirect.
 * Defense-in-depth — `createBillingPortalSession` is the security boundary
 * but the cost here is zero.
 */
function isStripePortalUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  return parsed.hostname === "stripe.com" || parsed.hostname.endsWith(".stripe.com")
}

interface PlanCardActionButtonProps {
  organizationId: string
  actionLabel: string
  isActionDisabled: boolean
  actionVariant: "primary" | "ghost"
}

const DISABLED_CLASS =
  "inline-flex h-11 w-full cursor-not-allowed items-center justify-center border border-[var(--color-rule)] bg-[var(--color-surface)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]"

const PRIMARY_CLASS =
  "inline-flex h-11 w-full items-center justify-center bg-[var(--color-signal)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-canvas)] transition-colors hover:bg-[var(--color-signal-deep)] active:translate-y-px disabled:cursor-wait disabled:opacity-70"

const GHOST_CLASS =
  "inline-flex h-11 w-full items-center justify-center border border-[var(--color-graphite)] bg-transparent font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-graphite)] transition-colors hover:bg-[var(--color-graphite)] hover:text-[var(--color-canvas)] disabled:cursor-wait disabled:opacity-70"

export function PlanCardActionButton({
  organizationId,
  actionLabel,
  isActionDisabled,
  actionVariant,
}: PlanCardActionButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await createBillingPortalSession({
        organizationId,
        returnPath: "/dashboard/settings/billing",
      })
      if ("error" in result) {
        setError(result.error)
        return
      }
      if (!isStripePortalUrl(result.url)) {
        setError("Unexpected billing portal URL. Please try again.")
        return
      }
      window.location.href = result.url
    })
  }

  if (isActionDisabled) {
    return (
      <button
        type="button"
        disabled
        title={actionLabel}
        className={DISABLED_CLASS}
      >
        {actionLabel}
      </button>
    )
  }

  const enabledClass = actionVariant === "primary" ? PRIMARY_CLASS : GHOST_CLASS

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className={enabledClass}
      >
        {isPending ? "Opening portal…" : actionLabel}
      </button>
      {error ? (
        <p className="mt-2 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-signal-deep)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
