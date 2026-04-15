"use client"

import { useMemo, useState } from "react"
import { Activity } from "lucide-react"
import { format, subDays, subWeeks, subMonths } from "date-fns"

import { useCutHistoryAnalytics } from "@/app/dashboard/_hooks/use-cut-history-analytics"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

import { MultiMetricChart } from "./_components/multi-metric-chart"
import { TrendAnalysis } from "./_components/trend-analysis"
import { SeasonalAnalysis } from "./_components/seasonal-analysis"
import { TrendMetricCards } from "./_components/trend-metric-cards"
import { KeyInsightsCard } from "./_components/key-insights-card"

interface TrendData {
  date: string
  cuts: number
  materialUsed: number
  wastePercentage: number
  efficiency: number
  cost: number
}

interface TrendMetrics {
  cutsChange: number
  materialUsageChange: number
  wasteChange: number
  efficiencyChange: number
  costChange: number
}

export default function TrendsPage() {
  const [timeframe, setTimeframe] = useState("30days")

  const { startDate, groupBy } = useMemo(() => {
    switch (timeframe) {
      case "7days":
        return { startDate: subDays(new Date(), 7), groupBy: "day" as const }
      case "30days":
        return { startDate: subDays(new Date(), 30), groupBy: "day" as const }
      case "12weeks":
        return { startDate: subWeeks(new Date(), 12), groupBy: "week" as const }
      case "12months":
        return { startDate: subMonths(new Date(), 12), groupBy: "month" as const }
      default:
        return { startDate: subDays(new Date(), 30), groupBy: "day" as const }
    }
  }, [timeframe])

  const now = useMemo(() => new Date(), [])
  const { data: cutsData, isLoading: loading } = useCutHistoryAnalytics({
    from: startDate,
    to: now,
  })

  const { trendData, trendMetrics } = useMemo(() => {
    const groupedData: Record<
      string,
      {
        cuts: number
        totalMaterialUsed: number
        totalWastePercent: number
        totalCost: number
        validWasteCuts: number
      }
    > = {}

    cutsData.forEach((cut) => {
      const cutDate = new Date(cut.cut_date)
      let periodKey: string

      if (groupBy === "day") {
        periodKey = format(cutDate, "yyyy-MM-dd")
      } else if (groupBy === "week") {
        const weekStart = new Date(cutDate)
        weekStart.setDate(cutDate.getDate() - cutDate.getDay())
        periodKey = format(weekStart, "yyyy-MM-dd")
      } else {
        periodKey = format(cutDate, "yyyy-MM")
      }

      if (!groupedData[periodKey]) {
        groupedData[periodKey] = {
          cuts: 0,
          totalMaterialUsed: 0,
          totalWastePercent: 0,
          totalCost: 0,
          validWasteCuts: 0,
        }
      }

      const g = groupedData[periodKey]
      g.cuts += 1
      g.totalMaterialUsed += cut.material_used_sqft

      const wastePercent = (1 - cut.fab_score) * 100
      g.totalWastePercent += wastePercent
      g.validWasteCuts += 1

      const costPerSqft = cut.cost_per_sqft ?? 0
      g.totalCost += cut.material_used_sqft * costPerSqft
    })

    const trends: TrendData[] = Object.entries(groupedData)
      .map(([date, data]) => {
        const averageWaste = data.validWasteCuts > 0 ? data.totalWastePercent / data.validWasteCuts : 0
        return {
          date: groupBy === "month" ? `${date}-01` : date,
          cuts: data.cuts,
          materialUsed: data.totalMaterialUsed,
          wastePercentage: averageWaste,
          efficiency: 100 - averageWaste,
          cost: data.totalCost,
        }
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let metrics: TrendMetrics | null = null
    if (trends.length >= 2) {
      const recent = trends.slice(-7)
      const previous = trends.slice(-14, -7)

      if (previous.length > 0) {
        const avg = (arr: TrendData[], key: keyof Omit<TrendData, "date">) =>
          arr.reduce((sum, item) => sum + item[key], 0) / arr.length

        const calculateChange = (current: number, prev: number) =>
          prev !== 0 ? ((current - prev) / prev) * 100 : 0

        metrics = {
          cutsChange: calculateChange(avg(recent, "cuts"), avg(previous, "cuts")),
          materialUsageChange: calculateChange(
            avg(recent, "materialUsed"),
            avg(previous, "materialUsed")
          ),
          wasteChange: calculateChange(
            avg(recent, "wastePercentage"),
            avg(previous, "wastePercentage")
          ),
          efficiencyChange: calculateChange(avg(recent, "efficiency"), avg(previous, "efficiency")),
          costChange: calculateChange(avg(recent, "cost"), avg(previous, "cost")),
        }
      }
    }

    return { trendData: trends, trendMetrics: metrics }
  }, [cutsData, groupBy])

  const formatTrendValue = (value: number, showSign = true) => {
    const sign = showSign && value > 0 ? "+" : ""
    return `${sign}${value.toFixed(1)}%`
  }

  const getTrendColor = (value: number, inverse = false) => {
    const isPositive = inverse ? value < 0 : value > 0
    return isPositive ? "text-green-600" : "text-red-600"
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading trend analysis...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trends</h1>
          <p className="text-muted-foreground">
            Analyze performance trends and identify patterns over time
          </p>
        </div>
        <Select value={timeframe} onValueChange={setTimeframe}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="12weeks">Last 12 Weeks</SelectItem>
            <SelectItem value="12months">Last 12 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {trendMetrics && (
        <TrendMetricCards
          metrics={trendMetrics}
          formatTrendValue={formatTrendValue}
          getTrendColor={getTrendColor}
        />
      )}

      {/* Multi-Metric Chart */}
      <MultiMetricChart data={trendData} timeframe={timeframe} />

      {/* Analysis Components */}
      <div className="grid gap-4 md:grid-cols-2">
        <TrendAnalysis data={trendData} />
        <SeasonalAnalysis data={trendData} timeframe={timeframe} />
      </div>

      {trendMetrics && (
        <KeyInsightsCard metrics={trendMetrics} formatTrendValue={formatTrendValue} />
      )}
    </div>
  )
}
