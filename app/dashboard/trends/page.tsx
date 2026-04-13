"use client"

import { useEffect, useState } from "react"
import { Activity } from "lucide-react"
import { format, subDays, subWeeks, subMonths } from "date-fns"

import { cutService } from "@/src/infrastructure/services/cutService"
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
  const [trendData, setTrendData] = useState<TrendData[]>([])
  const [trendMetrics, setTrendMetrics] = useState<TrendMetrics | null>(null)
  const [timeframe, setTimeframe] = useState("30days")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrendData = async () => {
      setLoading(true)
      try {
        let startDate: Date
        let groupBy: "day" | "week" | "month"

        switch (timeframe) {
          case "7days":
            startDate = subDays(new Date(), 7)
            groupBy = "day"
            break
          case "30days":
            startDate = subDays(new Date(), 30)
            groupBy = "day"
            break
          case "12weeks":
            startDate = subWeeks(new Date(), 12)
            groupBy = "week"
            break
          case "12months":
            startDate = subMonths(new Date(), 12)
            groupBy = "month"
            break
          default:
            startDate = subDays(new Date(), 30)
            groupBy = "day"
        }

        const cuts = await cutService.getCutsByDateRangeWithRolls(startDate, undefined, {
          ascending: true,
        })

        const cutsData = cuts || []

        // Group data by time period
        const groupedData: Record<
          string,
          {
            cuts: number
            totalMaterialUsed: number
            totalWaste: number
            totalCost: number
            validWasteCuts: number
          }
        > = {}

        cutsData.forEach((cut) => {
          const cutDate = new Date(cut.created_at)
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
              totalWaste: 0,
              totalCost: 0,
              validWasteCuts: 0,
            }
          }

          groupedData[periodKey].cuts += 1
          groupedData[periodKey].totalMaterialUsed += cut.total_sqft_used || 0

          if (cut.waste_percentage !== null) {
            groupedData[periodKey].totalWaste += cut.waste_percentage || 0
            groupedData[periodKey].validWasteCuts += 1
          }

          const costPerSqft = cut.roll?.cost_per_sqft || 2.5
          groupedData[periodKey].totalCost += (cut.total_sqft_used || 0) * costPerSqft
        })

        // Convert to trend data
        const trends: TrendData[] = Object.entries(groupedData)
          .map(([date, data]) => {
            const averageWaste = data.validWasteCuts > 0 ? data.totalWaste / data.validWasteCuts : 0
            const efficiency = 100 - averageWaste

            return {
              date: groupBy === "month" ? `${date}-01` : date,
              cuts: data.cuts,
              materialUsed: data.totalMaterialUsed,
              wastePercentage: averageWaste,
              efficiency,
              cost: data.totalCost,
            }
          })
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        setTrendData(trends)

        // Calculate period-over-period changes
        if (trends.length >= 2) {
          const recent = trends.slice(-7) // Last 7 periods
          const previous = trends.slice(-14, -7) // Previous 7 periods

          if (previous.length > 0) {
            const recentAvg = {
              cuts: recent.reduce((sum, item) => sum + item.cuts, 0) / recent.length,
              materialUsed:
                recent.reduce((sum, item) => sum + item.materialUsed, 0) / recent.length,
              wastePercentage:
                recent.reduce((sum, item) => sum + item.wastePercentage, 0) / recent.length,
              efficiency: recent.reduce((sum, item) => sum + item.efficiency, 0) / recent.length,
              cost: recent.reduce((sum, item) => sum + item.cost, 0) / recent.length,
            }

            const previousAvg = {
              cuts: previous.reduce((sum, item) => sum + item.cuts, 0) / previous.length,
              materialUsed:
                previous.reduce((sum, item) => sum + item.materialUsed, 0) / previous.length,
              wastePercentage:
                previous.reduce((sum, item) => sum + item.wastePercentage, 0) / previous.length,
              efficiency:
                previous.reduce((sum, item) => sum + item.efficiency, 0) / previous.length,
              cost: previous.reduce((sum, item) => sum + item.cost, 0) / previous.length,
            }

            const calculateChange = (current: number, previous: number) =>
              previous !== 0 ? ((current - previous) / previous) * 100 : 0

            setTrendMetrics({
              cutsChange: calculateChange(recentAvg.cuts, previousAvg.cuts),
              materialUsageChange: calculateChange(
                recentAvg.materialUsed,
                previousAvg.materialUsed
              ),
              wasteChange: calculateChange(recentAvg.wastePercentage, previousAvg.wastePercentage),
              efficiencyChange: calculateChange(recentAvg.efficiency, previousAvg.efficiency),
              costChange: calculateChange(recentAvg.cost, previousAvg.cost),
            })
          }
        }
      } catch (error) {
        console.error("Error fetching trend data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchTrendData()
  }, [timeframe])

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
