"use client"

import { useState, useEffect } from "react"
import { Calendar } from "lucide-react"
import { format, subDays, startOfMonth } from "date-fns"
import { toast } from "sonner"

import { DatePickerWithRange } from "@/app/components/ui/date-range-picker"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"
import { fetchCutsInRange } from "@/app/actions/cuts"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

/**
 * Avg waste % for a single CutHistory row: scrap / (scrap + material
 * used). Returns 0 when both columns are 0 so we don't surface NaN
 * into the chart.
 */
function wastePercent(cut: CutHistory): number {
  const total = cut.scrap_sqft + cut.material_used_sqft
  return total > 0 ? (cut.scrap_sqft / total) * 100 : 0
}

import { ComparisonSummaryCards } from "./_components/comparison-summary-cards"
import { WasteCharts } from "./_components/waste-charts"

interface WasteMetrics {
  period: string
  avgWaste: number
  totalCuts: number
  totalWasteSqft: number
  totalMaterialUsed: number
}

interface ComparisonData {
  current: WasteMetrics
  previous: WasteMetrics
  improvement: number
  savingsSqft: number
  savingsDollars: number
}

export default function WasteComparisonPage() {
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: new Date(),
  })
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [trendData, setTrendData] = useState<
    { date: string; avgWaste: number; totalWaste: number; cuts: number }[]
  >([])
  const [materialComparison, setMaterialComparison] = useState<
    { material: string; currentWaste: number; previousWaste: number }[]
  >([])

  useEffect(() => {
    // `cancelled` guards against stale resolves — fast date-range
    // changes used to let an older request finish last and overwrite
    // `comparison` / `trendData` / `materialComparison` with the
    // wrong period's data. Same pattern as the supplier detail
    // sheet fix (PR #203).
    let cancelled = false

    const calculateMetrics = (cuts: CutHistory[], period: string): WasteMetrics => {
      if (cuts.length === 0) {
        return {
          period,
          avgWaste: 0,
          totalCuts: 0,
          totalWasteSqft: 0,
          totalMaterialUsed: 0,
        }
      }

      const totalWasteSqft = cuts.reduce((sum, cut) => sum + cut.scrap_sqft, 0)
      const totalMaterialUsed = cuts.reduce((sum, cut) => sum + cut.material_used_sqft, 0)
      const avgWaste = cuts.reduce((sum, cut) => sum + wastePercent(cut), 0) / cuts.length

      return {
        period,
        avgWaste,
        totalCuts: cuts.length,
        totalWasteSqft,
        totalMaterialUsed,
      }
    }

    const fetchTrendDataInner = async (from: Date, to: Date) => {
      try {
        const cuts = await fetchCutsInRange(from, to)

        // Group by day
        const dailyData: { [key: string]: { total: number; count: number; waste: number } } = {}

        cuts?.forEach((cut) => {
          const day = format(new Date(cut.cut_date ?? cut.created_at), "yyyy-MM-dd")
          if (!dailyData[day]) {
            dailyData[day] = { total: 0, count: 0, waste: 0 }
          }
          dailyData[day].total += wastePercent(cut)
          dailyData[day].count += 1
          dailyData[day].waste += cut.scrap_sqft
        })

        const trend = Object.entries(dailyData).map(([date, data]) => ({
          date: format(new Date(date), "MMM dd"),
          avgWaste: data.count > 0 ? data.total / data.count : 0,
          totalWaste: data.waste,
          cuts: data.count,
        }))

        if (!cancelled) setTrendData(trend)
      } catch (error) {
        console.error("Error fetching trend data:", error)
      }
    }

    const fetchMaterialComparisonInner = async (
      from: Date,
      to: Date,
      previousFrom: Date,
      previousTo: Date
    ) => {
      try {
        // Fetch rolls to get material types
        const rollMaterialMap = await rollService.getRollMaterialTypeMap()

        // Create material type map (convert Map to plain object for compatibility)
        const materialMap: { [key: string]: string } = {}
        rollMaterialMap.forEach((materialType, rollId) => {
          materialMap[rollId] = materialType
        })

        // Fetch current period cuts
        const currentCuts = await fetchCutsInRange(from, to)

        // Fetch previous period cuts
        const previousCuts = await fetchCutsInRange(previousFrom, previousTo)

        // Group by material type
        const materialData: { [key: string]: { current: number[]; previous: number[] } } = {}

        currentCuts?.forEach((cut) => {
          const material = cut.roll_id ? materialMap[cut.roll_id] || "Unknown" : "Unknown"
          if (!materialData[material]) {
            materialData[material] = { current: [], previous: [] }
          }
          materialData[material].current.push(wastePercent(cut))
        })

        previousCuts?.forEach((cut) => {
          const material = cut.roll_id ? materialMap[cut.roll_id] || "Unknown" : "Unknown"
          if (!materialData[material]) {
            materialData[material] = { current: [], previous: [] }
          }
          materialData[material].previous.push(wastePercent(cut))
        })

        const comparison = Object.entries(materialData).map(([material, data]) => ({
          material,
          currentWaste:
            data.current.length > 0
              ? data.current.reduce((a, b) => a + b, 0) / data.current.length
              : 0,
          previousWaste:
            data.previous.length > 0
              ? data.previous.reduce((a, b) => a + b, 0) / data.previous.length
              : 0,
        }))

        if (!cancelled) setMaterialComparison(comparison)
      } catch (error) {
        console.error("Error fetching material comparison:", error)
      }
    }

    const fetchWasteComparison = async () => {
      setLoading(true)
      try {
        const { from, to } = dateRange
        const daysDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))

        // Previous period (same duration before current period)
        const previousFrom = subDays(from, daysDiff)
        const previousTo = subDays(to, daysDiff)

        // Fetch current period cuts
        const currentCuts = await fetchCutsInRange(from, to)

        // Fetch previous period cuts
        const previousCuts = await fetchCutsInRange(previousFrom, previousTo)

        // Calculate metrics for both periods
        const currentMetrics = calculateMetrics(currentCuts || [], "Current Period")
        const previousMetrics = calculateMetrics(previousCuts || [], "Previous Period")

        // Calculate improvement
        const improvement =
          previousMetrics.avgWaste > 0
            ? ((previousMetrics.avgWaste - currentMetrics.avgWaste) / previousMetrics.avgWaste) *
              100
            : 0

        const savingsSqft = previousMetrics.totalWasteSqft - currentMetrics.totalWasteSqft
        const avgCostPerSqft = 2.5 // Default average cost
        const savingsDollars = savingsSqft * avgCostPerSqft

        if (cancelled) return
        setComparison({
          current: currentMetrics,
          previous: previousMetrics,
          improvement,
          savingsSqft: Math.abs(savingsSqft),
          savingsDollars: Math.abs(savingsDollars),
        })

        // Fetch daily trend data
        await fetchTrendDataInner(from, to)

        // Fetch material-specific comparison
        await fetchMaterialComparisonInner(from, to, previousFrom, previousTo)
      } catch (error) {
        console.error("Error fetching waste comparison:", error)
        if (!cancelled) toast.error("Failed to load waste comparison data")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchWasteComparison()
    return () => {
      cancelled = true
    }
  }, [dateRange])

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Analytics", href: "/dashboard/analytics" },
          { label: "Waste comparison" },
        ]}
        title="Waste comparison"
        subtitle="Compare waste metrics across periods to spot improvements."
      />

      <ViewToolbar
        hideSearch
        filters={
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-muted-foreground" aria-hidden="true" />
            <DatePickerWithRange
              date={dateRange}
              onDateChange={(range) => {
                if (range && range.from && range.to) {
                  setDateRange({ from: range.from, to: range.to })
                }
              }}
            />
          </div>
        }
      />

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading comparison data…</p>
      ) : (
        <>
          {comparison && <ComparisonSummaryCards comparison={comparison} />}
          <WasteCharts trendData={trendData} materialComparison={materialComparison} />
        </>
      )}
    </PageShell>
  )
}
