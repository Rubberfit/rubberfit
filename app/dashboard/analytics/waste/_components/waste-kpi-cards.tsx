"use client"

import { Layers, Scissors, TrendingDown, Zap } from "lucide-react"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardHeader } from "@/app/components/ui/card"
import { StatCard, type StatCardProps } from "@/app/components/patterns"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  getAreaUnitLabel,
  getDisplayAreaValue,
} from "@/src/application/preferences/user-unit-display"

interface WasteKpiCardsProps {
  cuts: CutHistory[]
  isLoading: boolean
}

function SkeletonCard() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  )
}

/**
 * Half-vs-half trend: average the metric across the first half of
 * `cuts` and compare to the average across the second half. Returns
 * the percentage delta (positive = newer half is higher) or null
 * when there's not enough data to compare.
 */
function trend(cuts: CutHistory[], getValue: (c: CutHistory) => number): number | null {
  if (cuts.length < 2) return null
  const half = Math.floor(cuts.length / 2)
  const first = cuts.slice(0, half).reduce((s, c) => s + getValue(c), 0) / half
  const second = cuts.slice(half).reduce((s, c) => s + getValue(c), 0) / (cuts.length - half)
  if (first === 0) return null
  return ((second - first) / first) * 100
}

export function WasteKpiCards({ cuts, isLoading }: WasteKpiCardsProps) {
  const organizationPreferences = useOrganizationPreferences()
  const areaUnit = getAreaUnitLabel(organizationPreferences)
  const displayArea = (value: number) =>
    getDisplayAreaValue(value, organizationPreferences).toFixed(1)
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  const avgWaste =
    cuts.length > 0 ? cuts.reduce((s, c) => s + (1 - c.fab_score) * 100, 0) / cuts.length : 0

  const totalScrap = cuts.reduce((s, c) => s + c.scrap_sqft, 0)
  const totalReusable = cuts.reduce((s, c) => s + c.reusable_offset_sqft, 0)
  const totalMaterial = cuts.reduce((s, c) => s + c.material_used_sqft, 0)

  const wasteTrend = trend(cuts, (c) => (1 - c.fab_score) * 100)
  const scrapTrend = trend(cuts, (c) => c.scrap_sqft)

  const wasteLabel =
    avgWaste <= 10 ? "Excellent" : avgWaste <= 20 ? "Good" : avgWaste <= 35 ? "Moderate" : "High"

  const wasteSparkIntent: StatCardProps["sparkIntent"] =
    avgWaste > 35 ? "danger" : avgWaste > 20 ? "warning" : avgWaste > 10 ? "accent" : "success"

  // Waste / scrap going UP is bad — `intent: "negative-up"` flips the
  // chip color logic so increases turn red instead of green.
  const wasteTrendProp: StatCardProps["trend"] =
    wasteTrend == null
      ? undefined
      : {
          delta: wasteTrend,
          label: "vs prior half",
          intent: "negative-up",
          formatted: `${Math.abs(wasteTrend).toFixed(1)}%`,
        }
  const scrapTrendProp: StatCardProps["trend"] =
    scrapTrend == null
      ? undefined
      : {
          delta: scrapTrend,
          label: "vs prior half",
          intent: "negative-up",
          formatted: `${Math.abs(scrapTrend).toFixed(1)}%`,
        }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Avg waste ratio"
        icon={<Scissors />}
        value={`${avgWaste.toFixed(1)}%`}
        footnote={wasteLabel}
        sparkIntent={wasteSparkIntent}
        trend={wasteTrendProp}
      />
      <StatCard
        label="Total scrap"
        icon={<TrendingDown />}
        value={displayArea(totalScrap)}
        unit={areaUnit}
        footnote={`${cuts.length} cuts recorded`}
        trend={scrapTrendProp}
      />
      <StatCard
        label="Reusable offcut"
        icon={<Layers />}
        value={displayArea(totalReusable)}
        unit={areaUnit}
        footnote="Saved from scrap"
        sparkIntent="success"
      />
      <StatCard
        label="Material used"
        icon={<Zap />}
        value={displayArea(totalMaterial)}
        unit={areaUnit}
        footnote="Across all cuts"
      />
    </div>
  )
}
