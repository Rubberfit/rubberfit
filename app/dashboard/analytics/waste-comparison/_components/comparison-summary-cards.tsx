"use client"

import { Activity, Calendar, Scissors, TrendingDown } from "lucide-react"

import { StatCard, type StatCardProps } from "@/app/components/patterns"

interface ComparisonData {
  current: { avgWaste: number; totalCuts: number }
  previous: { avgWaste: number; totalCuts: number }
  improvement: number
  savingsSqft: number
  savingsDollars: number
}

interface ComparisonSummaryCardsProps {
  comparison: ComparisonData
}

export function ComparisonSummaryCards({ comparison }: ComparisonSummaryCardsProps) {
  // `improvement` is positive when current waste < previous waste,
  // i.e. less waste = better. Pass through StatCard's "positive-up"
  // intent so the chip turns green on positive improvement values.
  const improvementTrend: StatCardProps["trend"] =
    comparison.improvement === 0
      ? undefined
      : {
          delta: comparison.improvement,
          label: "vs prior period",
          intent: "positive-up",
          formatted: `${Math.abs(comparison.improvement).toFixed(1)}%`,
        }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <StatCard
        label="Current period avg"
        icon={<Activity />}
        value={`${comparison.current.avgWaste.toFixed(1)}%`}
        footnote={`${comparison.current.totalCuts} cuts`}
      />
      <StatCard
        label="Previous period avg"
        icon={<Calendar />}
        value={`${comparison.previous.avgWaste.toFixed(1)}%`}
        footnote={`${comparison.previous.totalCuts} cuts`}
      />
      <StatCard
        label="Improvement"
        icon={<TrendingDown />}
        value={`${Math.abs(comparison.improvement).toFixed(1)}%`}
        footnote={
          comparison.improvement > 0
            ? "Less waste"
            : comparison.improvement < 0
              ? "More waste"
              : "No change"
        }
        sparkIntent={
          comparison.improvement > 0 ? "success" : comparison.improvement < 0 ? "danger" : "accent"
        }
        trend={improvementTrend}
      />
      <StatCard
        label="Material saved"
        icon={<Scissors />}
        value={`$${comparison.savingsDollars.toFixed(0)}`}
        footnote={`${comparison.savingsSqft.toFixed(1)} sqft`}
        sparkIntent="success"
      />
    </div>
  )
}
