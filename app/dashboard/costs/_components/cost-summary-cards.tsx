"use client"

import { DollarSign, Scissors, Recycle, AlertCircle, Calculator } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

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
  const wasteTone = !hasWastePercentage
    ? "text-muted-foreground"
    : wastePercentage <= 10
      ? "text-green-600"
      : wastePercentage <= 20
        ? "text-yellow-600"
        : "text-red-600"

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalCost.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">Total stock consumed</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cut Value</CardTitle>
          <Scissors className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalCutCost.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">Material used in cuts</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Reusable Value</CardTitle>
          <Recycle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalReusableCost.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">Leftover material for reuse</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waste Cost</CardTitle>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalWasteCost.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">Material wasted</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waste Impact</CardTitle>
          <Calculator className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {hasWastePercentage ? `${wastePercentage.toFixed(1)}%` : "-"}
          </div>
          <p className={`text-xs ${wasteTone}`}>{wasteLabel}</p>
        </CardContent>
      </Card>
    </div>
  )
}
