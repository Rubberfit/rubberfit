"use client"

import { useState, useTransition } from "react"

import { createBillingPortalSession } from "@/app/actions/billing"

/**
 * Stripe-hosted Customer Portal sessions live at `billing.stripe.com`
 * (Stripe routes them through that subdomain specifically — not the
 * dashboard or marketing roots). We validate the host before
 * navigating so a future refactor or compromised upstream can't turn
 * the server action's URL field into an open redirect.
 * Defense-in-depth — `createBillingPortalSession` is the security
 * boundary but the cost here is zero.
 */
function isStripePortalUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch (err) {
    // URL parse failure means the upstream returned something that
    // isn't a URL at all — refuse the redirect. Bind + void keeps
    // the lint rule against bare-catch happy.
    void err
    return false
  }
  if (parsed.protocol !== "https:") return false
  return parsed.hostname === "billing.stripe.com"
}

export function ManageSubscriptionButton({
  organizationId,
  returnPath = "/dashboard/settings/billing",
}: {
  organizationId: string
  returnPath?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await createBillingPortalSession({ organizationId, returnPath })
        if ("error" in result) {
          setError(result.error)
          return
        }
        if (!isStripePortalUrl(result.url)) {
          setError("Unexpected billing portal URL. Please try again.")
          return
        }
        window.location.href = result.url
      } catch (err) {
        // Server-action invocation itself threw — Next.js scrubs custom
        // error properties across the RPC boundary in production, so
        // surface a generic toast and let the action's console.error
        // tell on-call what actually happened.
        // (Bind as `err` to avoid shadowing the `error` useState above.)
        void err
        setError("Unable to open billing portal. Please try again.")
      }
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="h-10 w-full bg-[var(--color-signal)] font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-canvas)] hover:bg-[var(--color-signal-deep)] disabled:cursor-wait"
      >
        {isPending ? "Opening portal…" : "Manage billing"}
      </button>
      {error ? (
        <p
          role="alert"
          className="mt-2 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-signal-deep)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
