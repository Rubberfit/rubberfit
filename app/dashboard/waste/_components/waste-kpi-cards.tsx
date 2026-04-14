"use client"

import { Layers, Scissors, TrendingDown, TrendingUp, Zap } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { type CutHistory } from "@/src/infrastructure/models/supabase"

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

function trend(cuts: CutHistory[], getValue: (c: CutHistory) => number): number | null {
  if (cuts.length < 2) return null
  const half = Math.floor(cuts.length / 2)
  const first = cuts.slice(0, half).reduce((s, c) => s + getValue(c), 0) / half
  const second = cuts.slice(half).reduce((s, c) => s + getValue(c), 0) / (cuts.length - half)
  if (first === 0) return null
  return ((second - first) / first) * 100
}

interface KpiCardProps {
  title: string
  value: string
  sub?: string
  icon: React.ReactNode
  trendPct?: number | null
  /** when the metric going up is bad (waste), invert the colour logic */
  invertTrend?: boolean
}

function KpiCard({ title, value, sub, icon, trendPct, invertTrend }: KpiCardProps) {
  const isUp = (trendPct ?? 0) > 0
  const isGood = invertTrend ? !isUp : isUp
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        {trendPct !== null && trendPct !== undefined && (
          <p
            className={[
              "mt-1 flex items-center gap-0.5 text-xs font-medium",
              isGood ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400",
            ].join(" ")}
          >
            {isUp ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(trendPct).toFixed(1)}% vs prior half
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function WasteKpiCards({ cuts, isLoading }: WasteKpiCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }

  const avgWaste =
    cuts.length > 0
      ? cuts.reduce((s, c) => s + (1 - c.fab_score) * 100, 0) / cuts.length
      : 0

  const totalScrap = cuts.reduce((s, c) => s + c.scrap_sqft, 0)
  const totalReusable = cuts.reduce((s, c) => s + c.reusable_offset_sqft, 0)
  const totalMaterial = cuts.reduce((s, c) => s + c.material_used_sqft, 0)

  const wasteTrend = trend(cuts, (c) => (1 - c.fab_score) * 100)
  const scrapTrend = trend(cuts, (c) => c.scrap_sqft)

  const wasteLabel =
    avgWaste <= 10 ? "Excellent" :
    avgWaste <= 20 ? "Good" :
    avgWaste <= 35 ? "Moderate" :
    "High"

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        title="Avg Waste Ratio"
        value={`${avgWaste.toFixed(1)}%`}
        sub={wasteLabel}
        icon={<Scissors className="h-4 w-4" />}
        trendPct={wasteTrend}
        invertTrend
      />
      <KpiCard
        title="Total Scrap"
        value={`${totalScrap.toFixed(1)} ft²`}
        sub={`${cuts.length} cuts recorded`}
        icon={<TrendingDown className="h-4 w-4" />}
        trendPct={scrapTrend}
        invertTrend
      />
      <KpiCard
        title="Reusable Offcut"
        value={`${totalReusable.toFixed(1)} ft²`}
        sub="Saved from scrap"
        icon={<Layers className="h-4 w-4" />}
      />
      <KpiCard
        title="Material Used"
        value={`${totalMaterial.toFixed(1)} ft²`}
        sub="Across all cuts"
        icon={<Zap className="h-4 w-4" />}
      />
    </div>
  )
}
