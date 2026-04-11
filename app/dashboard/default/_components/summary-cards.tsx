"use client"

import { Package, Scissors, AlertTriangle, DollarSign } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface SummaryCardsProps {
  loading: boolean
  totalActiveRolls: number
  cutsThisWeek: number
  wastePercentage: number
  inventoryValue: number
  formatCurrency: (value: number) => string
}

export function SummaryCards({
  loading,
  totalActiveRolls,
  cutsThisWeek,
  wastePercentage,
  inventoryValue,
  formatCurrency,
}: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Rolls</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "-" : totalActiveRolls}</div>
          <p className="text-xs text-muted-foreground">In inventory</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cuts This Week</CardTitle>
          <Scissors className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "-" : cutsThisWeek}</div>
          <p className="text-xs text-muted-foreground">Completed cuts</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waste %</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? "-" : `${wastePercentage.toFixed(1)}%`}
          </div>
          <p className="text-xs text-muted-foreground">This month</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{loading ? "-" : formatCurrency(inventoryValue)}</div>
          <p className="text-xs text-muted-foreground">Total value</p>
        </CardContent>
      </Card>
    </div>
  )
}
