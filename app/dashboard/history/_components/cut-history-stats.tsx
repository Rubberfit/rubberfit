"use client"

import { Package, Scissors, TrendingDown, Zap } from "lucide-react"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { StatCard, type StatCardProps } from "@/app/components/patterns"

interface CutHistoryStatsProps {
  cuts: CutHistory[]
}

export function CutHistoryStats({ cuts }: CutHistoryStatsProps) {
  const totalCuts = cuts.length
  const totalPieces = cuts.reduce((sum, cut) => sum + cut.cut_amount, 0)
  const totalMatUsed = cuts.reduce((sum, cut) => sum + cut.material_used_sqft, 0)
  const avgFabScore =
    cuts.length > 0 ? cuts.reduce((sum, cut) => sum + cut.fab_score, 0) / cuts.length : 0
  // Waste is the complement of the fab score (scrap / total material)
  const avgWastePct = (1 - avgFabScore) * 100
  // Per Kimi: >20% → warning, >10% → accent, ≤10% → success
  const wasteIntent: StatCardProps["sparkIntent"] =
    cuts.length === 0
      ? "accent"
      : avgWastePct > 20
        ? "warning"
        : avgWastePct > 10
          ? "accent"
          : "success"
  const wasteFootnote =
    cuts.length === 0
      ? "No data"
      : avgWastePct <= 10
        ? "Excellent efficiency"
        : avgWastePct <= 20
          ? "Good efficiency"
          : "Review efficiency"

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total cuts"
        icon={<Scissors />}
        value={totalCuts}
        footnote="Cutting operations logged"
      />
      <StatCard
        label="Total pieces"
        icon={<Package />}
        value={totalPieces}
        footnote="Individual pieces cut"
      />
      <StatCard
        label="Material used"
        icon={<Zap />}
        value={totalMatUsed.toFixed(1)}
        unit="sqft"
        footnote="Square feet consumed"
      />
      <StatCard
        label="Average waste"
        icon={<TrendingDown />}
        value={cuts.length > 0 ? `${avgWastePct.toFixed(1)}%` : "—"}
        footnote={wasteFootnote}
        sparkIntent={wasteIntent}
      />
    </div>
  )
}
