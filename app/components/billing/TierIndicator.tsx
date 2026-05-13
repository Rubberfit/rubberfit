"use client"

import * as React from "react"
import Link from "next/link"

interface TierIndicatorProps {
  tier: "standard" | "pro" | "max" | "enterprise"
  status?: "active" | "trialing" | "past_due" | "canceled" | null
}

export function TierIndicator({ tier, status }: TierIndicatorProps) {
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
    if (tier === "enterprise") {
      return (
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.16em] text-[var(--color-blueprint)]">
          ENT
        </span>
      )
    }
    if (tier === "max") {
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
