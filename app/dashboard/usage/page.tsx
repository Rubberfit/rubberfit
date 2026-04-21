"use client"

import { useEffect, useMemo, useState } from "react"
import { BarChart3, Package, TrendingUp, Activity } from "lucide-react"
import { format, subMonths } from "date-fns"

import { useCutHistoryAnalytics } from "@/app/dashboard/_hooks/use-cut-history-analytics"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import type { MaterialType } from "@/src/entities"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

import { UsageTrendChart } from "./_components/usage-trend-chart"
import { MaterialDistributionChart } from "./_components/material-distribution-chart"
import { MaterialUsageTable } from "./_components/material-usage-table"
import { RecentUsageTable } from "./_components/recent-usage-table"

interface MaterialUsage {
  materialType: string
  totalSqftUsed: number
  totalCuts: number
  averageUtilization: number
  totalValue: number
  rollsUsed: number
}

interface UsageData {
  period: string
  totalUsage: number
  cuts: number
}

export default function MaterialUsagePage() {
  const startDate = useMemo(() => subMonths(new Date(), 6), [])
  const now = useMemo(() => new Date(), [])

  const { data: cutsData, isLoading: loading } = useCutHistoryAnalytics({
    from: startDate,
    to: now,
  })

  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  useEffect(() => {
    materialTypeService
      .getAll()
      .then(setMaterialTypes)
      .catch((_err) => {
        console.error("Failed to load material types:", _err)
      })
  }, [])

  const costByMaterial = useMemo(() => {
    const map = new Map<string, number>()
    for (const mt of materialTypes) {
      if (mt.default_cost != null && !map.has(mt.name)) {
        map.set(mt.name, mt.default_cost)
      }
    }
    return map
  }, [materialTypes])

  const { materialUsage, usageTrend, recentActivity } = useMemo(() => {
    // Recent activity (last 20 cuts, most recent first)
    const recent = [...cutsData].reverse().slice(0, 20)

    // Material usage grouped by stock_label
    const materialStats = cutsData.reduce(
      (acc, cut) => {
        const material = cut.stock_label || "Unknown"
        if (!acc[material]) {
          acc[material] = {
            materialType: material,
            totalSqftUsed: 0,
            totalCuts: 0,
            totalValue: 0,
            totalFabScore: 0,
          }
        }

        acc[material].totalSqftUsed += cut.material_used_sqft
        acc[material].totalCuts += 1
        acc[material].totalFabScore += cut.fab_score

        const costPerSqft = costByMaterial.get(material) ?? cut.cost_per_sqft ?? 0
        acc[material].totalValue += cut.material_used_sqft * costPerSqft

        return acc
      },
      {} as Record<
        string,
        {
          materialType: string
          totalSqftUsed: number
          totalCuts: number
          totalValue: number
          totalFabScore: number
        }
      >
    )

    const materialUsageData: MaterialUsage[] = Object.values(materialStats)
      .map((stat) => ({
        materialType: stat.materialType,
        totalSqftUsed: stat.totalSqftUsed,
        totalCuts: stat.totalCuts,
        averageUtilization: stat.totalCuts > 0 ? (stat.totalFabScore / stat.totalCuts) * 100 : 0,
        totalValue: stat.totalValue,
        rollsUsed: 0,
      }))
      .sort((a, b) => b.totalSqftUsed - a.totalSqftUsed)

    // Monthly usage trend
    const trendData: UsageData[] = []
    for (let i = 5; i >= 0; i--) {
      const monthStart = subMonths(new Date(), i + 1)
      const monthEnd = subMonths(new Date(), i)

      const monthCuts = cutsData.filter((cut) => {
        const cutDate = new Date(cut.cut_date)
        return cutDate >= monthStart && cutDate < monthEnd
      })

      const totalUsage = monthCuts.reduce((sum, cut) => sum + cut.material_used_sqft, 0)

      trendData.push({
        period: format(monthStart, "MMM yyyy"),
        totalUsage,
        cuts: monthCuts.length,
      })
    }

    return { materialUsage: materialUsageData, usageTrend: trendData, recentActivity: recent }
  }, [cutsData, costByMaterial])

  const totalSqftUsed = materialUsage.reduce((sum, m) => sum + m.totalSqftUsed, 0)
  const totalValue = materialUsage.reduce((sum, m) => sum + m.totalValue, 0)
  const totalCuts = materialUsage.reduce((sum, m) => sum + m.totalCuts, 0)

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">Loading usage data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Material Usage</h1>
        <p className="text-muted-foreground">
          Track material consumption patterns and utilization efficiency
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Material Used</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSqftUsed.toFixed(0)} sq ft</div>
            <p className="text-xs text-muted-foreground">Last 6 months</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Material Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Worth of material consumed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cuts</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCuts}</div>
            <p className="text-xs text-muted-foreground">Cutting operations</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Material Types</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{materialUsage.length}</div>
            <p className="text-xs text-muted-foreground">Types in use</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <UsageTrendChart data={usageTrend} />
        <MaterialDistributionChart data={materialUsage} />
      </div>

      <MaterialUsageTable data={materialUsage} />

      <RecentUsageTable data={recentActivity} />
    </div>
  )
}
