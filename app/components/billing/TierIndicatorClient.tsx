"use client"

import * as React from "react"

import { getCurrentTierStatus } from "@/app/actions/tier"

import { TierIndicator } from "./TierIndicator"

/**
 * Client wrapper that fetches the current tier on mount and feeds
 * it into the presentational `<TierIndicator>`. Renders nothing
 * while the fetch is in flight (sidebar already has spacing reserved
 * by the parent) and swallows fetch failures — a transient billing-
 * gate error must never break the sidebar shell.
 */
export function TierIndicatorClient() {
  const [data, setData] = React.useState<{
    tier: "standard" | "pro" | "max" | "enterprise"
    // `requireActiveSubscription` (server-side) narrows the gate to
    // `active | trialing`. The TierIndicator component accepts the
    // wider 4-state union for design completeness; we feed it only
    // the two states that can actually arrive.
    status: "active" | "trialing"
  } | null>(null)

  React.useEffect(() => {
    let cancelled = false
    getCurrentTierStatus()
      .then((result) => {
        if (cancelled) return
        setData(result)
      })
      .catch((_err: unknown) => {
        // Sidebar must keep rendering even if the gate query fails.
        // The proxy already routes lapsed/blocked customers away from
        // the dashboard, so a failure here is unexpected; we just
        // omit the indicator rather than surface a noisy error.
        if (cancelled) return
        setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return null
  return <TierIndicator tier={data.tier} status={data.status} />
}
