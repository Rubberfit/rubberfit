"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { getCurrentTierStatus } from "@/app/actions/tier"

type Tier = "standard" | "pro" | "max" | "enterprise"

interface NavUserTierPillProps {
  /** Pre-supplied tier when a parent already knows the value. When
   * omitted, the pill self-fetches via `getCurrentTierStatus`. */
  tier?: Tier
}

const TIER_STYLES: Record<Tier, string> = {
  standard: "bg-[var(--color-graphite)] text-white",
  pro: "bg-[var(--color-signal)] text-white",
  max: "bg-[var(--color-graphite)] text-[var(--color-signal)] border border-[var(--color-signal)]",
  enterprise: "bg-[var(--color-signal)] text-white",
}

/**
 * Tiny tier badge that overlays the sidebar user avatar. Click
 * navigates to `/dashboard/settings/billing` — `e.preventDefault()`
 * + `e.stopPropagation()` so it doesn't trigger the user-menu
 * dropdown the avatar opens on click.
 *
 * Per Kimi's spec: signal-orange for paid tiers (Pro/Enterprise),
 * graphite for Standard (default but visible), graphite with
 * signal-orange text + border for Max (premium feel without being
 * loud). Full tier names rendered uppercase — narrow enough at the
 * 9px font size to read clearly even when "ENTERPRISE" extends past
 * the avatar edge.
 */
export function NavUserTierPill({ tier: tierProp }: NavUserTierPillProps) {
  const router = useRouter()
  const [tier, setTier] = React.useState<Tier | null>(tierProp ?? null)

  React.useEffect(() => {
    if (tierProp) {
      setTier(tierProp)
      return
    }
    let cancelled = false
    getCurrentTierStatus()
      .then((result) => {
        if (cancelled) return
        setTier(result.tier)
      })
      .catch(() => {
        if (cancelled) return
        // Silent fallback: the user-row still renders, the pill just
        // doesn't appear. The sidebar must keep working even if the
        // gate query transiently fails.
        setTier(null)
      })
    return () => {
      cancelled = true
    }
  }, [tierProp])

  if (!tier) return null

  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`${tier} plan — manage billing`}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        router.push("/dashboard/settings/billing")
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          router.push("/dashboard/settings/billing")
        }
      }}
      className={`absolute -top-[7px] left-0 z-20 inline-flex h-[14px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[2px] px-[5px] font-[family-name:var(--font-mono)] text-[9px] uppercase leading-none tracking-[0.08em] ring-1 ring-white transition-opacity hover:opacity-90 ${TIER_STYLES[tier]}`}
    >
      {tier}
    </span>
  )
}
