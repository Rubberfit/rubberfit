"use client"

import { useEffect, useMemo, useState } from "react"
import { format, startOfWeek, endOfWeek, subDays, startOfDay } from "date-fns"

import { PageHeader, PageShell } from "@/app/components/patterns"
import { cn } from "@/app/lib/utils"

import { type Roll, type Cut, type MaterialType } from "@/src/infrastructure/models/supabase"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"
import { cutService } from "@/src/infrastructure/services/cutService"
import { legacyMaterialTypeService as materialTypeService } from "@/src/infrastructure/services/legacyMaterialTypeService"

import { SummaryCards } from "./_components/dashboard-summary-cards"
import { DashboardSidebar } from "./_components/dashboard-activity-aside"
import { UtilizationCard, type UtilizationDatum } from "./_components/dashboard-utilization-card"
import { RecentCutsCard, type RecentCutRow } from "./_components/dashboard-recent-cuts-card"
import { DashboardExportMenu } from "./_components/dashboard-export-menu"
import { type OperationsExportInput } from "./_components/dashboard-export-utils"

type Period = "week" | "month" | "quarter"
type UtilizationPeriod = "7d" | "30d" | "90d"

interface DashboardData {
  totalActiveRolls: number
  inventoryValue: number
  cutsThisWeek: number
  wastePercentage: number
  cutsGrowthPercent?: number
  wasteImprovementPercent?: number
  wasteSparkline: number[]
  cutsSparkline: number[]
  lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }>
  recentActivity: Array<{
    type: "cut" | "roll_added" | "roll_depleted"
    description: string
    timestamp: string
  }>
  /** 90 days of cuts (with roll join) — client-side aggregated per period. */
  cutsLast90d: UtilizationCut[]
  recentCuts: RecentCutRow[]
  weekLabel: string
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const
const tenantDisplayName = "REMA Operations"

type UtilizationCut = Cut & { roll?: { material_type: string; location: string } | null }

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("week")
  const [utilPeriod, setUtilPeriod] = useState<UtilizationPeriod>("7d")
  const [data, setData] = useState<DashboardData>({
    totalActiveRolls: 0,
    inventoryValue: 0,
    cutsThisWeek: 0,
    wastePercentage: 0,
    wasteSparkline: [],
    cutsSparkline: [],
    lowStockMaterials: [],
    recentActivity: [],
    cutsLast90d: [],
    recentCuts: [],
    weekLabel: "",
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)

        const now = new Date()
        const weekStart = startOfWeek(now, { weekStartsOn: 1 })
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
        const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`
        // Fetch 90 days once; the utilization chart filters client-side.
        const rangeStart = subDays(startOfDay(now), 89)

        const [
          activeRolls,
          cutsLast90d,
          monthWasteData,
          materialTypes,
          recentCutsData,
          recentRollsData,
          wasteTrendData,
          cutsGrowth,
          wasteImprovement,
        ] = await Promise.all([
          rollService.getActiveRolls().catch(() => [] as Roll[]),
          // Join cuts to rolls so material_type + width are available
          // for utilization aggregation across any selected window.
          cutService
            .getCutsByDateRangeWithRolls(rangeStart, now)
            .catch(() => [] as UtilizationCut[]),
          cutService.getMonthlyWastePercentages().catch(() => [] as { waste_percentage: number }[]),
          materialTypeService.getAll().catch(() => [] as MaterialType[]),
          cutService.getRecentCutsWithRolls(5).catch(() => []),
          rollService.getRecentRolls(5).catch(() => [] as Roll[]),
          cutService
            .getWasteTrendByWeek(8)
            .catch(() => [] as { period: string; wastePercentage: number }[]),
          cutService.getCutsGrowthPercentage().catch(() => undefined as number | undefined),
          cutService.getWasteImprovementPercentage().catch(() => undefined as number | undefined),
        ])

        // "This week" cuts = subset of the 90d pull in [weekStart, weekEnd].
        const cutsThisWeekData = cutsLast90d.filter((c) => {
          const t = new Date(c.created_at).getTime()
          return t >= weekStart.getTime() && t <= weekEnd.getTime()
        })

        const totalActiveRolls = activeRolls.length
        const inventoryValue = activeRolls.reduce(
          (total, roll) =>
            total + ((roll.remaining_length * roll.width) / 144) * (roll.cost_per_sqft || 0),
          0
        )
        const cutsThisWeek = cutsThisWeekData.length
        const wastePercentage =
          monthWasteData.length > 0
            ? monthWasteData.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) /
              monthWasteData.length
            : 0

        const lowStockMaterials = buildLowStock(materialTypes, activeRolls)
        const recentActivity = buildActivityFeed(recentCutsData, recentRollsData)

        const wasteSparkline = wasteTrendData.map((w) => w.wastePercentage)
        const cutsSparkline = buildCutsPerDaySeries(cutsLast90d)

        const recentCuts = buildRecentCutsRows(recentCutsData)

        setData({
          totalActiveRolls,
          inventoryValue,
          cutsThisWeek,
          wastePercentage,
          cutsGrowthPercent: cutsGrowth,
          wasteImprovementPercent: wasteImprovement,
          wasteSparkline,
          cutsSparkline,
          lowStockMaterials,
          recentActivity,
          cutsLast90d,
          recentCuts,
          weekLabel,
        })
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [period])

  const periodLabel = useMemo(
    () => buildPeriodLabel(period, data.weekLabel),
    [period, data.weekLabel]
  )

  const eyebrow = useMemo(
    () =>
      period === "week" ? `Operations / Week · ${data.weekLabel}` : `Operations / ${periodLabel}`,
    [period, data.weekLabel, periodLabel]
  )

  const subtitle = tenantDisplayName

  // Client-side aggregation per utilization period — swaps whenever
  // the operator clicks 7d / 30d / 90d without any refetch.
  const utilization = useMemo(
    () => buildUtilizationSeriesForPeriod(data.cutsLast90d, utilPeriod),
    [data.cutsLast90d, utilPeriod]
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  const exportInput = useMemo<OperationsExportInput>(
    () => ({
      period,
      periodLabel,
      utilPeriod,
      totalActiveRolls: data.totalActiveRolls,
      cutsThisWeek: data.cutsThisWeek,
      wastePercentage: data.wastePercentage,
      inventoryValue: data.inventoryValue,
      utilization,
      recentCuts: data.recentCuts,
    }),
    [
      period,
      periodLabel,
      utilPeriod,
      data.totalActiveRolls,
      data.cutsThisWeek,
      data.wastePercentage,
      data.inventoryValue,
      utilization,
      data.recentCuts,
    ]
  )

  return (
    <PageShell variant="overview">
      <PageHeader
        eyebrow={eyebrow}
        title="Operations overview"
        subtitle={subtitle}
        actions={
          <>
            <PeriodToggle value={period} onChange={setPeriod} />
            <DashboardExportMenu input={exportInput} disabled={loading} />
          </>
        }
      />

      <SummaryCards
        loading={loading}
        totalActiveRolls={data.totalActiveRolls}
        cutsThisWeek={data.cutsThisWeek}
        wastePercentage={data.wastePercentage}
        inventoryValue={data.inventoryValue}
        cutsGrowthPercent={data.cutsGrowthPercent}
        wasteImprovementPercent={data.wasteImprovementPercent}
        wasteSparkline={data.wasteSparkline}
        cutsSparkline={data.cutsSparkline}
        formatCurrency={formatCurrency}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <UtilizationCard
          data={utilization.series}
          materials={utilization.materials}
          period={utilPeriod}
          onPeriodChange={setUtilPeriod}
        />
        <RecentCutsCard rows={data.recentCuts} isLoading={loading} />
      </div>

      <DashboardSidebar
        loading={loading}
        lowStockMaterials={data.lowStockMaterials}
        recentActivity={data.recentActivity}
        formatDate={formatDate}
      />
    </PageShell>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function buildPeriodLabel(period: Period, weekLabel: string): string {
  switch (period) {
    case "week":
      return weekLabel
    case "month":
      return format(new Date(), "MMMM yyyy")
    case "quarter": {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3) + 1
      return `Q${q} ${now.getFullYear()}`
    }
  }
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  // Mono uppercase segmented control per Kimi §6 — active tab inverts
  // surface (graphite bg + Mill-paper text) so it reads like a
  // pressed industrial actuator rather than a SaaS pill.
  const options: Array<{ id: Period; label: string }> = [
    { id: "week", label: "This week" },
    { id: "month", label: "Month" },
    { id: "quarter", label: "Quarter" },
  ]
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-sm px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors",
            value === option.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function buildLowStock(
  materialTypes: MaterialType[],
  activeRolls: Roll[]
): Array<{ materialType: string; currentStock: number; threshold: number }> {
  if (materialTypes.length === 0 || activeRolls.length === 0) return []
  const out: Array<{ materialType: string; currentStock: number; threshold: number }> = []
  for (const materialType of materialTypes) {
    const threshold = materialType.min_stock_alert || 0
    const materialRolls = activeRolls.filter((roll) => roll.material_type === materialType.name)
    const currentStock = materialRolls.reduce(
      (total, roll) => total + (roll.remaining_length * roll.width) / 144,
      0
    )
    if (currentStock < threshold) {
      out.push({ materialType: materialType.name, currentStock, threshold })
    }
  }
  return out
}

function buildActivityFeed(
  recentCuts: Array<Cut & { roll?: { material_type: string; location: string } }>,
  recentRolls: Roll[]
): DashboardData["recentActivity"] {
  const activity: DashboardData["recentActivity"] = []
  for (const cut of recentCuts) {
    const rollInfo = cut.roll as { material_type: string; location: string } | undefined
    activity.push({
      type: "cut",
      description: `Cut ${cut.cut_width}" × ${cut.cut_length}" × ${cut.quantity} from ${rollInfo?.material_type || "Unknown"}`,
      timestamp: cut.created_at,
    })
  }
  for (const roll of recentRolls) {
    activity.push({
      type: roll.status === "depleted" ? "roll_depleted" : "roll_added",
      description: `${roll.status === "depleted" ? "Depleted" : "Added"} ${roll.material_type} roll ${roll.width}" × ${roll.length}"`,
      timestamp: roll.created_at,
    })
  }
  activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return activity.slice(0, 8)
}

function buildCutsPerDaySeries(cutsLast90d: Cut[]): number[] {
  // Rolling last-7-day buckets (oldest → newest). Using calendar-week
  // buckets meant cuts only ever landed in today's slot this early on
  // Monday, producing a spike-then-flat sparkline. A rolling window
  // incorporates the previous 6 days so the trend line actually moves.
  const now = Date.now()
  const buckets = new Array(7).fill(0) as number[]
  const DAY_MS = 86_400_000
  for (const cut of cutsLast90d) {
    const daysAgo = Math.floor((now - new Date(cut.created_at).getTime()) / DAY_MS)
    if (daysAgo >= 0 && daysAgo < 7) {
      buckets[6 - daysAgo] += 1
    }
  }
  return buckets
}

/**
 * Build a stacked-bar dataset for the utilization chart.
 *
 *   7d  — 7 buckets, one per weekday (Mon..Sun).
 *   30d — ~5 buckets, one per ISO week ending on each bucket.
 *   90d — ~13 buckets, one per ISO week.
 *
 * Each bucket aggregates material_used (sqft) by material_type.
 * Only the top-5 materials by total sqft are kept as series; the
 * rest collapse into "Other" so the legend stays readable.
 */
function buildUtilizationSeriesForPeriod(
  cuts: ReadonlyArray<UtilizationCut>,
  period: UtilizationPeriod
): { series: UtilizationDatum[]; materials: string[] } {
  if (cuts.length === 0) return { series: [], materials: [] }

  const now = Date.now()
  const windowDays = period === "7d" ? 7 : period === "30d" ? 30 : 90
  const windowStart = now - windowDays * 24 * 60 * 60 * 1000
  const inWindow = cuts.filter((c) => new Date(c.created_at).getTime() >= windowStart)
  if (inWindow.length === 0) return { series: [], materials: [] }

  // Count total sqft per material to pick top-5.
  const totalByMaterial = new Map<string, number>()
  for (const cut of inWindow) {
    const material = cut.roll?.material_type ?? "Unknown"
    const used = (cut.cut_width * cut.cut_length * cut.quantity) / 144
    totalByMaterial.set(material, (totalByMaterial.get(material) ?? 0) + used)
  }
  const topMaterials = [...totalByMaterial.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([m]) => m)
  const materialSet = new Set(topMaterials)

  // Bucketing: 7d = per-day, 30d/90d = per-week.
  const bucketMode: "day" | "week" = period === "7d" ? "day" : "week"
  const bucketCount = period === "7d" ? 7 : period === "30d" ? 5 : 13
  const bucketMs = bucketMode === "day" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
  const bucketEnd = now
  const bucketStart = bucketEnd - bucketCount * bucketMs

  const buckets: UtilizationDatum[] = []
  for (let i = 0; i < bucketCount; i++) {
    const start = bucketStart + i * bucketMs
    const end = start + bucketMs
    const label =
      bucketMode === "day"
        ? DAY_LABELS[(new Date(start).getDay() + 6) % 7]
        : format(new Date(end - 1), "MMM d")
    const row: UtilizationDatum = { label }
    for (const material of topMaterials) row[material] = 0
    row["Other"] = 0
    for (const cut of inWindow) {
      const t = new Date(cut.created_at).getTime()
      if (t < start || t >= end) continue
      const material = cut.roll?.material_type ?? "Unknown"
      const used = (cut.cut_width * cut.cut_length * cut.quantity) / 144
      const key = materialSet.has(material) ? material : "Other"
      row[key] = Math.round(((row[key] as number) + used) * 10) / 10
    }
    buckets.push(row)
  }

  const hasOther = buckets.some((r) => (r["Other"] as number) > 0)
  const materials = hasOther ? [...topMaterials, "Other"] : topMaterials
  // Remove the "Other" key from rows if unused to keep data clean.
  if (!hasOther) {
    for (const row of buckets) delete row["Other"]
  }
  return { series: buckets, materials }
}

function buildRecentCutsRows(
  cuts: Array<Cut & { roll?: { material_type: string; location: string } }>
): RecentCutRow[] {
  return cuts.map((cut, index) => {
    const waste = cut.waste_percentage ?? 0
    const utilization = Math.max(0, 100 - waste)
    // `cut_by` is the schema column (free-text operator name).
    // Fall back to job_reference when unset.
    const operator =
      (cut as { cut_by?: string | null }).cut_by ||
      (cut as { job_reference?: string | null }).job_reference ||
      "—"
    return {
      id: String(cut.id ?? `cut-${index}`),
      jobCode: `CUT-${String(cut.id ?? index)
        .slice(-4)
        .toUpperCase()}`,
      operator,
      utilizationPct: Number(utilization.toFixed(1)),
      whenLabel: formatRelative(cut.created_at),
    }
  })
}

function formatRelative(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin} min ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  if (diffH < 48) return "yesterday"
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}
