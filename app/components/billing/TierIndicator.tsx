"use client"

import * as React from "react"
import Link from "next/link"

interface TierIndicatorProps {
  tier: "standard" | "pro" | "max" | "enterprise"
  status?: "active" | "trialing" | "past_due" | "canceled" | null
}

export function TierIndicator({ tier, status }: TierIndicatorProps) {
  // Hide the strip for healthy Enterprise customers. There's no
  // in-product upgrade affordance for them (contract changes flow
  // through their account manager), and an empty-right-side strip
  // with just "ENTERPRISE" on the left reads as unfinished chrome.
  // Past-due / canceled / trialing states still render so billing
  // problems are visible even on Enterprise contracts.
  if (
    tier === "enterprise" &&
    status !== "past_due" &&
    status !== "canceled" &&
    status !== "trialing"
  ) {
    return null
  }

  const isPastDue = status === "past_due"
  const isCanceled = status === "canceled"
  const isTrialing = status === "trialing"

  const topBorder = isPastDue
    ? "border-t-2 border-t-[var(--color-tape)]"
    : isCanceled
    ? "border-t-2 border-t-[var(--color-signal)]"
    : "border-t border-t-[var(--color-rule)]"

  const ariaLabel = `Current plan: ${tier}${isTrialing ? " trial" : ""}. Click to manage billing.`

  const rightNode = (() => {
    if (isPastDue) {
      return (
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-tape)]">
          PAST DUE
        </span>
      )
    }
    if (isCanceled) {
      return (
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-signal)]">
          CANCELED
        </span>
      )
    }
    if (isTrialing) {
      return (
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-signal)]">
          {tier.toUpperCase()} · TRIAL
        </span>
      )
    }
    // Enterprise + Max: nothing on the right. The tier label on the
    // left carries the identity — adding a duplicate `ENT` / `MAX`
    // badge reads as redundant. Enterprise customers manage their
    // contract through their account manager, not through an
    // in-product upgrade affordance.
    if (tier === "enterprise" || tier === "max") {
      return null
    }
    // Standard or Pro: show upgrade affordance
    return (
      <span className="border-b border-transparent font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-signal)] transition-colors group-hover:border-[var(--color-signal)]">
        ↑ UPGRADE
      </span>
    )
  })()

  return (
    <Link
      href="/dashboard/settings/billing"
      className={`group flex h-12 items-center justify-between px-4 ${topBorder} bg-[var(--color-surface)] transition-colors duration-150 hover:bg-[var(--color-surface-raised)]`}
      aria-label={ariaLabel}
    >
      <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-ink)]">
        {tier}
      </span>
      {rightNode}
    </Link>
  )
}
