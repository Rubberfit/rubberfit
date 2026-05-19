"use client"

import { useMemo } from "react"
import { Activity, BarChart3, Package, TrendingUp } from "lucide-react"
import { format, subMonths } from "date-fns"

import { useCutHistoryAnalytics } from "@/app/hooks/use-cut-history-analytics"
import { PageHeader, PageShell, StatCard } from "@/app/components/patterns"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  getAreaUnitLabel,
  getDisplayAreaValue,
} from "@/src/application/preferences/user-unit-display"

import { MaterialDistributionChart } from "./_components/material-distribution-chart"
import { MaterialUsageTable } from "./_components/material-usage-table"
import { RecentUsageTable } from "./_components/recent-usage-table"
import { UsageTrendChart } from "./_components/usage-trend-chart"

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
  const organizationPreferences = useOrganizationPreferences()
  const startDate = useMemo(() => subMonths(new Date(), 6), [])
  const now = useMemo(() => new Date(), [])

  const { data: cutsData, isLoading: loading } = useCutHistoryAnalytics({
    from: startDate,
    to: now,
  })

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

        const costPerSqft = cut.cost_per_sqft ?? 0
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
  }, [cutsData])

  const totalSqftUsed = materialUsage.reduce((sum, m) => sum + m.totalSqftUsed, 0)
  const totalValue = materialUsage.reduce((sum, m) => sum + m.totalValue, 0)
  const totalCuts = materialUsage.reduce((sum, m) => sum + m.totalCuts, 0)

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Analytics", href: "/dashboard/analytics" },
          { label: "Usage" },
        ]}
        title="Material usage"
        subtitle="Analyze material consumption and inventory draw-down by period."
      />

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Activity
              className="mx-auto size-8 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted-foreground">Loading usage data…</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total material used"
              icon={<Package />}
              value={getDisplayAreaValue(totalSqftUsed, organizationPreferences).toFixed(0)}
              unit={getAreaUnitLabel(organizationPreferences)}
              footnote="Last 6 months"
            />
            <StatCard
              label="Material value"
              icon={<TrendingUp />}
              value={`$${totalValue.toFixed(0)}`}
              footnote="Worth of material consumed"
              sparkIntent="accent"
            />
            <StatCard
              label="Total cuts"
              icon={<BarChart3 />}
              value={totalCuts}
              footnote="Cutting operations"
            />
            <StatCard
              label="Material types"
              icon={<Package />}
              value={materialUsage.length}
              footnote="Types in use"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <UsageTrendChart data={usageTrend} />
            <MaterialDistributionChart data={materialUsage} />
          </div>

          <MaterialUsageTable data={materialUsage} />

          <RecentUsageTable data={recentActivity} />
        </>
      )}
    </PageShell>
  )
}
