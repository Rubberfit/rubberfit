"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

import { useCutHistoryAnalytics } from "@/app/hooks/use-cut-history-analytics"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import type { MaterialType } from "@/src/infrastructure/models/supabase"
import { exportService } from "@/src/infrastructure/services/exportService"
import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

import { CostTrendChart } from "./_components/cost-trend-chart"
import { CostBreakdownChart } from "./_components/cost-breakdown-chart"
import { MonthlyCostTable } from "./_components/monthly-cost-table"
import { MaterialCostTable } from "./_components/material-cost-table"
import { CostSummaryCards } from "./_components/cost-summary-cards"

interface MonthlyCosts {
  period: string
  cutCost: number
  reusableCost: number
  wasteCost: number
  totalCost: number
  cuts: number
}

interface MaterialCost {
  materialType: string
  totalCost: number
  cutCost: number
  reusableCost: number
  wasteCost: number
  cuts: number
  avgCostPerCut: number
}

export default function CostReportsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState("6months")

  const monthsBack = selectedPeriod === "12months" ? 12 : 6
  const startDate = useMemo(() => subMonths(new Date(), monthsBack), [monthsBack])
  const now = useMemo(() => new Date(), [])

  const { data: cutsData, isLoading: _loading } = useCutHistoryAnalytics({
    from: startDate,
    to: now,
  })

  // Fetch current material prices so reports always reflect the latest cost
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  useEffect(() => {
    materialTypeService
      .getAll()
      .then(setMaterialTypes)
      .catch((_err) => {
        console.error("Failed to load material types:", _err)
      })
  }, [])

  // Build a lookup: material name → current default_cost
  const costByMaterial = useMemo(() => {
    const map = new Map<string, number>()
    for (const mt of materialTypes) {
      if (mt.default_cost != null && !map.has(mt.name)) {
        map.set(mt.name, mt.default_cost)
      }
    }
    return map
  }, [materialTypes])

  const { monthlyCosts, materialCosts } = useMemo(() => {
    const monthlyData: MonthlyCosts[] = []
    for (let i = monthsBack - 1; i >= 0; i--) {
      const monthStart = startOfMonth(subMonths(new Date(), i))
      const monthEnd = endOfMonth(subMonths(new Date(), i))

      const monthCuts = cutsData.filter((cut) => {
        const cutDate = new Date(cut.cut_date)
        return cutDate >= monthStart && cutDate <= monthEnd
      })

      let cutCost = 0
      let reusableCost = 0
      let wasteCost = 0
      let totalCost = 0
      for (const cut of monthCuts) {
        const costPerSqft = costByMaterial.get(cut.stock_label ?? "") ?? cut.cost_per_sqft ?? 0
        const stockSqft = cut.material_used_sqft + cut.reusable_offset_sqft + cut.scrap_sqft
        totalCost += stockSqft * costPerSqft
        cutCost += cut.material_used_sqft * costPerSqft
        reusableCost += cut.reusable_offset_sqft * costPerSqft
        wasteCost += cut.scrap_sqft * costPerSqft
      }

      monthlyData.push({
        period: format(monthStart, "MMM yyyy"),
        cutCost,
        reusableCost,
        wasteCost,
        totalCost,
        cuts: monthCuts.length,
      })
    }

    const materialStats = cutsData.reduce(
      (acc, cut) => {
        const material = cut.stock_label || "Unknown"
        const costPerSqft = costByMaterial.get(material) ?? cut.cost_per_sqft ?? 0
        const stockSqft = cut.material_used_sqft + cut.reusable_offset_sqft + cut.scrap_sqft

        if (!acc[material]) {
          acc[material] = {
            materialType: material,
            totalCost: 0,
            cutCost: 0,
            reusableCost: 0,
            wasteCost: 0,
            cuts: 0,
          }
        }

        acc[material].totalCost += stockSqft * costPerSqft
        acc[material].cutCost += cut.material_used_sqft * costPerSqft
        acc[material].reusableCost += cut.reusable_offset_sqft * costPerSqft
        acc[material].wasteCost += cut.scrap_sqft * costPerSqft
        acc[material].cuts += 1

        return acc
      },
      {} as Record<
        string,
        {
          materialType: string
          totalCost: number
          cutCost: number
          reusableCost: number
          wasteCost: number
          cuts: number
        }
      >
    )

    const materialCostData: MaterialCost[] = Object.values(materialStats)
      .map((stat) => ({
        materialType: stat.materialType,
        totalCost: stat.totalCost,
        cutCost: stat.cutCost,
        reusableCost: stat.reusableCost,
        wasteCost: stat.wasteCost,
        cuts: stat.cuts,
        avgCostPerCut: stat.cuts > 0 ? stat.totalCost / stat.cuts : 0,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)

    return { monthlyCosts: monthlyData, materialCosts: materialCostData }
  }, [cutsData, monthsBack, costByMaterial])

  const totalCost = monthlyCosts.reduce((sum, month) => sum + month.totalCost, 0)
  const totalCutCost = monthlyCosts.reduce((sum, month) => sum + month.cutCost, 0)
  const totalReusableCost = monthlyCosts.reduce((sum, month) => sum + month.reusableCost, 0)
  const totalWasteCost = monthlyCosts.reduce((sum, month) => sum + month.wasteCost, 0)
  const wastePercentage = totalCost > 0 ? (totalWasteCost / totalCost) * 100 : 0

  const exportReport = () => {
    const headers = [
      "Period",
      "Material Type",
      "Total Cost",
      "Cut Value",
      "Reusable Value",
      "Waste Cost",
    ]
    const rows: (string | number)[][] = []

    monthlyCosts.forEach((month) => {
      rows.push([
        month.period,
        "All Materials",
        `$${month.totalCost.toFixed(2)}`,
        `$${month.cutCost.toFixed(2)}`,
        `$${month.reusableCost.toFixed(2)}`,
        `$${month.wasteCost.toFixed(2)}`,
      ])
    })

    rows.push(["", "", "", "", "", ""])
    rows.push(["Material Breakdown", "", "", "", "", ""])
    materialCosts.forEach((data) => {
      rows.push([
        "Current Period",
        data.materialType,
        `$${data.totalCost.toFixed(2)}`,
        `$${data.cutCost.toFixed(2)}`,
        `$${data.reusableCost.toFixed(2)}`,
        `$${data.wasteCost.toFixed(2)}`,
      ])
    })

    exportService.exportToCSV({
      headers,
      rows,
      filename: "cost-report",
    })
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Period filter — tab strip carries the page identity. */}
      <div className="flex justify-end">
        <div className="flex items-center gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportReport} variant="outline">
            Export Report
          </Button>
        </div>
      </div>

      {/* Cost Summary */}
      <CostSummaryCards
        totalCost={totalCost}
        totalCutCost={totalCutCost}
        totalReusableCost={totalReusableCost}
        totalWasteCost={totalWasteCost}
        wastePercentage={wastePercentage}
      />

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <CostTrendChart data={monthlyCosts} />
        <CostBreakdownChart data={materialCosts} />
      </div>

      <MonthlyCostTable data={monthlyCosts} />

      <MaterialCostTable data={materialCosts} />
    </div>
  )
}
