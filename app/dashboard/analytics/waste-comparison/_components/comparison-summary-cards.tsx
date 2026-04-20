"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader } from "@/app/components/ui/card"

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
  const getImprovementColor = (value: number) => {
    if (value > 0) return "text-green-600"
    if (value < 0) return "text-red-600"
    return "text-muted-foreground"
  }

  const getImprovementIcon = (value: number) => {
    if (value > 0) return <TrendingDown className="h-4 w-4" />
    if (value < 0) return <TrendingUp className="h-4 w-4" />
    return <Minus className="h-4 w-4" />
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Current Period Avg</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{comparison.current.avgWaste.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">{comparison.current.totalCuts} cuts</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Previous Period Avg</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{comparison.previous.avgWaste.toFixed(1)}%</div>
          <p className="text-xs text-muted-foreground">{comparison.previous.totalCuts} cuts</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Improvement</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold flex items-center gap-2 ${getImprovementColor(comparison.improvement)}`}
          >
            {getImprovementIcon(comparison.improvement)}
            {Math.abs(comparison.improvement).toFixed(1)}%
          </div>
          <p className="text-xs text-muted-foreground">
            {comparison.improvement > 0
              ? "Less waste"
              : comparison.improvement < 0
                ? "More waste"
                : "No change"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Material Saved</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${comparison.savingsDollars.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">{comparison.savingsSqft.toFixed(1)} sqft</p>
        </CardContent>
      </Card>
    </div>
  )
}
