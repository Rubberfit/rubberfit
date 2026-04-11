"use client"

import { TrendingUp, TrendingDown } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

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

export function TrendMetricCards({
  metrics,
  formatTrendValue,
  getTrendColor,
}: TrendMetricCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cuts Volume</CardTitle>
          {metrics.cutsChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getTrendColor(metrics.cutsChange)}`}>
            {formatTrendValue(metrics.cutsChange)}
          </div>
          <p className="text-xs text-muted-foreground">vs previous period</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Material Usage</CardTitle>
          {metrics.materialUsageChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-blue-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-blue-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getTrendColor(metrics.materialUsageChange)}`}>
            {formatTrendValue(metrics.materialUsageChange)}
          </div>
          <p className="text-xs text-muted-foreground">Material consumption</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Waste Level</CardTitle>
          {metrics.wasteChange <= 0 ? (
            <TrendingDown className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingUp className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getTrendColor(metrics.wasteChange, true)}`}>
            {formatTrendValue(metrics.wasteChange)}
          </div>
          <p className="text-xs text-muted-foreground">Waste percentage</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Efficiency</CardTitle>
          {metrics.efficiencyChange >= 0 ? (
            <TrendingUp className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getTrendColor(metrics.efficiencyChange)}`}>
            {formatTrendValue(metrics.efficiencyChange)}
          </div>
          <p className="text-xs text-muted-foreground">Material efficiency</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Costs</CardTitle>
          {metrics.costChange <= 0 ? (
            <TrendingDown className="h-4 w-4 text-green-600" />
          ) : (
            <TrendingUp className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getTrendColor(metrics.costChange, true)}`}>
            {formatTrendValue(metrics.costChange)}
          </div>
          <p className="text-xs text-muted-foreground">Material costs</p>
        </CardContent>
      </Card>
    </div>
  )
}
