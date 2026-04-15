"use client"

import { Scissors, Zap, TrendingDown, Package } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { type CutHistory } from "@/src/infrastructure/models/supabase"

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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Cuts</CardTitle>
          <Scissors className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalCuts}</div>
          <p className="text-xs text-muted-foreground">Cutting operations logged</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Pieces</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalPieces}</div>
          <p className="text-xs text-muted-foreground">Individual pieces cut</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Material Used</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalMatUsed.toFixed(1)}</div>
          <p className="text-xs text-muted-foreground">Square feet consumed</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Waste</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {cuts.length > 0 ? `${avgWastePct.toFixed(1)}%` : "—"}
          </div>
          <p className="text-xs text-muted-foreground">
            {cuts.length === 0
              ? "No data"
              : avgWastePct <= 10
                ? "Excellent efficiency"
                : avgWastePct <= 20
                  ? "Good efficiency"
                  : "Review efficiency"}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
