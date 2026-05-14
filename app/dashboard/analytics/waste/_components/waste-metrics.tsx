"use client"

import { TrendingDown, DollarSign, AlertCircle, Target } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { type Cut } from "@/src/infrastructure/models/supabase"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import { formatAreaSqft } from "@/src/application/preferences/user-unit-display"

interface WasteMetricsProps {
  cuts: (Cut & { roll?: { cost_per_sqft?: number } })[]
}

export function WasteMetrics({ cuts }: WasteMetricsProps) {
  const organizationPreferences = useOrganizationPreferences()
  const totalWasteSqft = cuts.reduce((sum, cut) => sum + (cut.waste_sqft || 0), 0)
  const totalCutsWithWaste = cuts.filter((cut) => cut.waste_percentage !== null).length

  const averageWastePercentage =
    totalCutsWithWaste > 0
      ? cuts
          .filter((cut) => cut.waste_percentage !== null)
          .reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / totalCutsWithWaste
      : 0

  const totalWasteValue = cuts.reduce((sum, cut) => {
    const costPerSqft = cut.roll?.cost_per_sqft || 2.5
    return sum + (cut.waste_sqft || 0) * costPerSqft
  }, 0)

  const highWasteCuts = cuts.filter((cut) => (cut.waste_percentage || 0) > 20).length

  const getWasteStatus = (percentage: number) => {
    if (percentage <= 10) return { text: "Excellent", color: "text-green-600" }
    if (percentage <= 20) return { text: "Good", color: "text-blue-600" }
    return { text: "Needs Improvement", color: "text-red-600" }
  }

  const wasteStatus = getWasteStatus(averageWastePercentage)

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Waste</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{averageWastePercentage.toFixed(1)}%</div>
          <p className={`text-xs ${wasteStatus.color}`}>{wasteStatus.text}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Waste</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">
            {formatAreaSqft(totalWasteSqft, organizationPreferences, { precision: 1 })}
          </div>
          <p className="text-xs text-muted-foreground">Material wasted in period</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waste Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${totalWasteValue.toFixed(0)}</div>
          <p className="text-xs text-muted-foreground">Estimated value of wasted material</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">High Waste Cuts</CardTitle>
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{highWasteCuts}</div>
          <p className="text-xs text-muted-foreground">Cuts with &gt;20% waste</p>
        </CardContent>
      </Card>
    </div>
  )
}
