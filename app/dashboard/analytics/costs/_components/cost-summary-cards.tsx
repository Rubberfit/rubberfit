"use client"

import { AlertCircle, Calculator, DollarSign, Recycle, Scissors } from "lucide-react"

import { StatCard, type StatCardProps } from "@/app/components/patterns"

interface CostSummaryCardsProps {
  totalCost: number
  totalCutCost: number
  totalReusableCost: number
  totalWasteCost: number
  wastePercentage: number
}

export function CostSummaryCards({
  totalCost,
  totalCutCost,
  totalReusableCost,
  totalWasteCost,
  wastePercentage,
}: CostSummaryCardsProps) {
  const hasWastePercentage = Number.isFinite(wastePercentage)
  const wasteLabel = !hasWastePercentage
    ? "Unavailable"
    : wastePercentage <= 10
      ? "Excellent"
      : wastePercentage <= 20
        ? "Good"
        : "Needs improvement"
  const wasteIntent: StatCardProps["sparkIntent"] = !hasWastePercentage
    ? "accent"
    : wastePercentage <= 10
      ? "success"
      : wastePercentage <= 20
        ? "warning"
        : "danger"

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Total cost"
        icon={<DollarSign />}
        value={`$${totalCost.toFixed(0)}`}
        footnote="Total stock consumed"
      />
      <StatCard
        label="Cut value"
        icon={<Scissors />}
        value={`$${totalCutCost.toFixed(0)}`}
        footnote="Material used in cuts"
      />
      <StatCard
        label="Reusable value"
        icon={<Recycle />}
        value={`$${totalReusableCost.toFixed(0)}`}
        footnote="Leftover material for reuse"
        sparkIntent="success"
      />
      <StatCard
        label="Waste cost"
        icon={<AlertCircle />}
        value={`$${totalWasteCost.toFixed(0)}`}
        footnote="Material wasted"
        sparkIntent="danger"
      />
      <StatCard
        label="Waste impact"
        icon={<Calculator />}
        value={hasWastePercentage ? `${wastePercentage.toFixed(1)}%` : "—"}
        footnote={wasteLabel}
        sparkIntent={wasteIntent}
      />
    </div>
  )
}
