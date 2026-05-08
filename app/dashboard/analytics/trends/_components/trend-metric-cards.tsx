"use client"

import { Activity, DollarSign, Layers, Scissors, TrendingDown } from "lucide-react"

import { StatCard, type StatCardProps } from "@/app/components/patterns"

interface TrendMetrics {
  cutsChange: number
  materialUsageChange: number
  wasteChange: number
  efficiencyChange: number
  costChange: number
}

interface TrendMetricCardsProps {
  metrics: TrendMetrics
  formatTrendValue: (value: number, showSign?: boolean) => string
  getTrendColor: (value: number, inverse?: boolean) => string
}

/**
 * Build a `StatCard` `trend` payload for one metric. `negativeUp`
 * inverts the success/failure semantic (e.g. waste going up is bad).
 * Cards display the change value as the primary number — there's no
 * "current value" to anchor since trends are relative.
 */
function trendFor(
  value: number,
  formatTrendValue: (value: number, showSign?: boolean) => string,
  negativeUp = false
): StatCardProps["trend"] {
  if (value === 0) return undefined
  return {
    delta: value,
    label: "vs prior period",
    intent: negativeUp ? "negative-up" : "positive-up",
    formatted: formatTrendValue(value, false),
  }
}

export function TrendMetricCards({ metrics, formatTrendValue }: TrendMetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Cuts volume"
        icon={<Scissors />}
        value={formatTrendValue(metrics.cutsChange)}
        footnote="vs previous period"
        trend={trendFor(metrics.cutsChange, formatTrendValue)}
      />
      <StatCard
        label="Material usage"
        icon={<Layers />}
        value={formatTrendValue(metrics.materialUsageChange)}
        footnote="Material consumption"
        trend={trendFor(metrics.materialUsageChange, formatTrendValue)}
      />
      <StatCard
        label="Waste level"
        icon={<TrendingDown />}
        value={formatTrendValue(metrics.wasteChange)}
        footnote="Waste percentage"
        trend={trendFor(metrics.wasteChange, formatTrendValue, true)}
        sparkIntent={metrics.wasteChange > 0 ? "danger" : "success"}
      />
      <StatCard
        label="Efficiency"
        icon={<Activity />}
        value={formatTrendValue(metrics.efficiencyChange)}
        footnote="Material efficiency"
        trend={trendFor(metrics.efficiencyChange, formatTrendValue)}
        sparkIntent={metrics.efficiencyChange >= 0 ? "success" : "danger"}
      />
      <StatCard
        label="Costs"
        icon={<DollarSign />}
        value={formatTrendValue(metrics.costChange)}
        footnote="Material costs"
        trend={trendFor(metrics.costChange, formatTrendValue, true)}
        sparkIntent={metrics.costChange > 0 ? "warning" : "success"}
      />
    </div>
  )
}
