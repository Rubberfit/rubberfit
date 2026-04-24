"use client"

import { Scissors, AlertTriangle, DollarSign, Package } from "lucide-react"

import { StatCard } from "@/app/components/patterns"
import { LoadingCard } from "@/app/components/patterns"

interface SummaryCardsProps {
  loading: boolean
  totalActiveRolls: number
  cutsThisWeek: number
  wastePercentage: number
  inventoryValue: number
  cutsGrowthPercent?: number
  wasteImprovementPercent?: number
  wasteSparkline?: ReadonlyArray<number>
  cutsSparkline?: ReadonlyArray<number>
  inventorySparkline?: ReadonlyArray<number>
  formatCurrency: (value: number) => string
}

/**
 * Operations Overview KPI row — four StatCards matching the
 * user-approved mock. Each card carries an inline sparkline
 * (recharts Area), a trend delta coloured by semantic intent
 * (waste-up is bad, cuts-up is good), and tabular numbers.
 *
 * Data origins:
 *   - Active rolls / inventory value: rollService aggregates
 *   - Cuts this week / growth: cutService.getCutsThisWeek + getCutsGrowthPercentage
 *   - Waste / improvement: cutService.getMonthlyWastePercentages + getWasteImprovementPercentage
 *   - Sparklines: getWasteTrendByWeek(8) + derived per-KPI series
 */
export function SummaryCards({
  loading,
  totalActiveRolls,
  cutsThisWeek,
  wastePercentage,
  inventoryValue,
  cutsGrowthPercent,
  wasteImprovementPercent,
  wasteSparkline,
  cutsSparkline,
  inventorySparkline,
  formatCurrency,
}: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingCard key={i} rows={0} showTitle />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Active Rolls"
        icon={<Package />}
        value={totalActiveRolls}
        footnote="In inventory"
        sparkline={inventorySparkline}
        sparkIntent="accent"
      />
      <StatCard
        label="Cuts this week"
        icon={<Scissors />}
        value={cutsThisWeek}
        trend={
          cutsGrowthPercent !== undefined
            ? {
                delta: cutsGrowthPercent,
                label: "vs last week",
                intent: "positive-up",
                formatted: `${Math.abs(cutsGrowthPercent).toFixed(1)}%`,
              }
            : undefined
        }
        sparkline={cutsSparkline}
        sparkIntent="accent"
      />
      <StatCard
        label="Material waste"
        icon={<AlertTriangle />}
        value={wastePercentage.toFixed(1)}
        unit="%"
        trend={
          wasteImprovementPercent !== undefined
            ? {
                delta: -wasteImprovementPercent,
                label: wasteImprovementPercent >= 0 ? "improved" : "worsened",
                intent: "negative-up",
                formatted: `${Math.abs(wasteImprovementPercent).toFixed(1)}%`,
              }
            : undefined
        }
        sparkline={wasteSparkline}
        sparkIntent="success"
      />
      <StatCard
        label="Inventory value"
        icon={<DollarSign />}
        value={formatCurrency(inventoryValue)}
        footnote="Total value"
        sparkIntent="accent"
      />
    </div>
  )
}
