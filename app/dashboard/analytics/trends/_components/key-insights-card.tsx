"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"

interface TrendMetrics {
  cutsChange: number
  materialUsageChange: number
  wasteChange: number
  efficiencyChange: number
  costChange: number
}

interface KeyInsightsCardProps {
  metrics: TrendMetrics
  formatTrendValue: (value: number, showSign?: boolean) => string
}

export function KeyInsightsCard({ metrics, formatTrendValue }: KeyInsightsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Insights</CardTitle>
        <CardDescription>Automated analysis of your operational trends</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics.efficiencyChange > 5 && (
          <div className="rounded-lg border bg-green-50 p-4 text-green-800 dark:bg-green-950 dark:text-green-300">
            <h4 className="font-medium">Efficiency Improving</h4>
            <p className="text-sm mt-1">
              Material efficiency has improved by{" "}
              {formatTrendValue(metrics.efficiencyChange, false)} - great work on waste reduction!
            </p>
          </div>
        )}

        {metrics.wasteChange > 10 && (
          <div className="rounded-lg border bg-amber-50 p-4 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <h4 className="font-medium">Waste Increase Detected</h4>
            <p className="text-sm mt-1">
              Waste levels have increased by {formatTrendValue(metrics.wasteChange, false)}. Review
              recent cutting operations and roll selection processes.
            </p>
          </div>
        )}

        {metrics.cutsChange > 20 && (
          <div className="rounded-lg border bg-blue-50 p-4 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            <h4 className="font-medium">High Activity Period</h4>
            <p className="text-sm mt-1">
              Cutting volume has increased by {formatTrendValue(metrics.cutsChange, false)}. Monitor
              inventory levels and consider bulk ordering.
            </p>
          </div>
        )}

        {Math.abs(metrics.cutsChange) < 5 && Math.abs(metrics.wasteChange) < 5 && (
          <div className="rounded-lg border bg-muted/50 p-4 text-foreground dark:bg-muted/50 dark:text-muted-foreground">
            <h4 className="font-medium">Stable Operations</h4>
            <p className="text-sm mt-1">
              Operations are stable with consistent cutting volume and waste levels. Good
              operational control maintained.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
