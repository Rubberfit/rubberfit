"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"

export interface UseInventoryStatsResult {
  activeCount: number
  totalSqft: number
  lowStockCount: number
  totalValueUsd: number
  isLoading: boolean
}

/**
 * Hero metrics for the inventory hub. Sums client-side from the
 * active-rolls list (matches the math used by the existing PDF
 * exporter — see `handleExportPDF` in `app/dashboard/inventory/page.tsx`).
 *
 * `lowStockCount` is wired in PR 3e once the reorder suggestions
 * service exposes a count helper; `TODO(ARC-DASHBOARD-INVENTORY)`
 * marker tracks the cleanup.
 */
export function useInventoryStats(refreshKey?: number): UseInventoryStatsResult {
  const [rolls, setRolls] = useState<Roll[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Wrapping the fetch in a callback keeps setState calls out of the
  // effect *body* — React 19's `react-hooks/set-state-in-effect` rule
  // permits setState inside async callbacks but not synchronously in
  // an effect body. The signal arg lets the effect short-circuit
  // post-unmount setState; an empty `{ cancelled }` is enough since
  // we only need a one-bit gate.
  const fetchStats = useCallback(async (signal: { cancelled: boolean }) => {
    setIsLoading(true)
    try {
      const data = await rollsSdk.list({ status: "active" })
      if (!signal.cancelled) setRolls(data ?? [])
    } catch {
      if (!signal.cancelled) setRolls([])
    } finally {
      if (!signal.cancelled) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const signal = { cancelled: false }
    void fetchStats(signal)
    return () => {
      signal.cancelled = true
    }
  }, [fetchStats, refreshKey])

  return useMemo(() => {
    const activeCount = rolls.length
    const totalSqft = rolls.reduce(
      (sum, roll) => sum + (roll.remaining_length * roll.width) / 144,
      0
    )
    const totalValueUsd = rolls.reduce(
      (sum, roll) => sum + (roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144,
      0
    )
    // TODO(ARC-DASHBOARD-INVENTORY): wire to reorder-suggestions count in PR 3e.
    const lowStockCount = 0

    return {
      activeCount,
      totalSqft,
      lowStockCount,
      totalValueUsd,
      isLoading,
    }
  }, [rolls, isLoading])
}
