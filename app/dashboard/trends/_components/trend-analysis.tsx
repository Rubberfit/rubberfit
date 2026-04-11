"use client"

import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface TrendData {
  date: string
  cuts: number
  materialUsed: number
  wastePercentage: number
  efficiency: number
  cost: number
}

interface TrendAnalysisProps {
  data: TrendData[]
}

export function TrendAnalysis({ data }: TrendAnalysisProps) {
  if (data.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend Analysis</CardTitle>
          <CardDescription>Not enough data for trend analysis</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  // Calculate trends using linear regression
  const calculateTrend = (values: number[]) => {
    const n = values.length
    const x = Array.from({ length: n }, (_, i) => i)
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = values.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0)
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    return slope
  }

  const getTrendDirection = (slope: number, threshold = 0.01) => {
    if (Math.abs(slope) < threshold) return "stable"
    return slope > 0 ? "increasing" : "decreasing"
  }

  const trends = {
    cuts: calculateTrend(data.map((d) => d.cuts)),
    materialUsed: calculateTrend(data.map((d) => d.materialUsed)),
    wastePercentage: calculateTrend(data.map((d) => d.wastePercentage)),
    efficiency: calculateTrend(data.map((d) => d.efficiency)),
    cost: calculateTrend(data.map((d) => d.cost)),
  }

  const TrendIndicator = ({ trend, inverse = false }: { trend: number; inverse?: boolean }) => {
    const direction = getTrendDirection(trend)
    const isGood = inverse ? direction === "decreasing" : direction === "increasing"

    if (direction === "stable") {
      return <Minus className="h-4 w-4 text-muted-foreground" />
    }

    const Icon = direction === "increasing" ? TrendingUp : TrendingDown
    const color = isGood ? "text-green-600" : "text-red-600"

    return <Icon className={`h-4 w-4 ${color}`} />
  }

  const getTrendBadge = (trend: number, inverse = false) => {
    const direction = getTrendDirection(trend)
    const isGood = inverse ? direction === "decreasing" : direction === "increasing"

    if (direction === "stable") {
      return <Badge variant="secondary">Stable</Badge>
    }

    return (
      <Badge variant={isGood ? "default" : "destructive"}>
        {direction === "increasing" ? "↗ Rising" : "↘ Falling"}
      </Badge>
    )
  }

  const trendItems = [
    {
      label: "Cuts Volume",
      trend: trends.cuts,
      description: "Number of cutting operations",
      inverse: false,
    },
    {
      label: "Material Usage",
      trend: trends.materialUsed,
      description: "Square footage consumed",
      inverse: false,
    },
    {
      label: "Waste Percentage",
      trend: trends.wastePercentage,
      description: "Material waste ratio",
      inverse: true,
    },
    {
      label: "Efficiency",
      trend: trends.efficiency,
      description: "Material utilization rate",
      inverse: false,
    },
    {
      label: "Costs",
      trend: trends.cost,
      description: "Material spending",
      inverse: true,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend Analysis</CardTitle>
        <CardDescription>Mathematical trend analysis of key performance indicators</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {trendItems.map((item, index) => (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendIndicator trend={item.trend} inverse={item.inverse} />
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="text-right">{getTrendBadge(item.trend, item.inverse)}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t">
          <h4 className="font-medium mb-3">Overall Assessment</h4>
          <div className="space-y-2">
            {getTrendDirection(trends.efficiency) === "increasing" && (
              <div className="text-sm text-green-700 dark:text-green-300">
                ✓ Material efficiency is improving over time
              </div>
            )}
            {getTrendDirection(trends.wastePercentage) === "decreasing" && (
              <div className="text-sm text-green-700 dark:text-green-300">
                ✓ Waste levels are decreasing consistently
              </div>
            )}
            {getTrendDirection(trends.cost) === "decreasing" && (
              <div className="text-sm text-green-700 dark:text-green-300">
                ✓ Material costs are trending downward
              </div>
            )}
            {getTrendDirection(trends.wastePercentage) === "increasing" && (
              <div className="text-sm text-red-700 dark:text-red-300">
                ⚠ Waste levels are increasing - review processes
              </div>
            )}
            {getTrendDirection(trends.cost) === "increasing" &&
              getTrendDirection(trends.materialUsed) !== "increasing" && (
                <div className="text-sm text-red-700 dark:text-red-300">
                  ⚠ Costs rising without proportional usage increase
                </div>
              )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
