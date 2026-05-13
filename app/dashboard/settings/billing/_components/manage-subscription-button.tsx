"use client"

import { useState, useTransition } from "react"

import { createBillingPortalSession } from "@/app/actions/billing"

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
      const result = await createBillingPortalSession({ organizationId, returnPath })
      if ("error" in result) {
        setError(result.error)
        return
      }
      window.location.href = result.url
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
        <p className="mt-2 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-signal-deep)]">
          {error}
        </p>
      ) : null}
    </div>
  )
}
