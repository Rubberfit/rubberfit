"use client"

import { useEffect, useState } from "react"
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns"

import { cutService } from "@/src/infrastructure/services/cutService"
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
  materialCost: number
  wasteCost: number
  totalCost: number
  cuts: number
}

interface MaterialCost {
  materialType: string
  totalCost: number
  wasteCost: number
  utilizationCost: number
  cuts: number
  avgCostPerCut: number
}

export default function CostReportsPage() {
  const [monthlyCosts, setMonthlyCosts] = useState<MonthlyCosts[]>([])
  const [materialCosts, setMaterialCosts] = useState<MaterialCost[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState("6months")
  const [_loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCostData = async () => {
      setLoading(true)
      try {
        const monthsBack = selectedPeriod === "12months" ? 12 : 6
        const startDate = subMonths(new Date(), monthsBack)

        const cuts = await cutService.getCutsByDateRangeWithRolls(startDate)

        const cutsData = cuts || []

        const monthlyData: MonthlyCosts[] = []
        for (let i = monthsBack - 1; i >= 0; i--) {
          const monthStart = startOfMonth(subMonths(new Date(), i))
          const monthEnd = endOfMonth(subMonths(new Date(), i))

          const monthCuts = cutsData.filter((cut) => {
            const cutDate = new Date(cut.created_at)
            return cutDate >= monthStart && cutDate <= monthEnd
          })

          const materialCost = monthCuts.reduce((sum, cut) => {
            const costPerSqft = cut.roll?.cost_per_sqft || 2.5
            return sum + (cut.total_sqft_used || 0) * costPerSqft
          }, 0)

          const wasteCost = monthCuts.reduce((sum, cut) => {
            const costPerSqft = cut.roll?.cost_per_sqft || 2.5
            return sum + (cut.waste_sqft || 0) * costPerSqft
          }, 0)

          monthlyData.push({
            period: format(monthStart, "MMM yyyy"),
            materialCost,
            wasteCost,
            totalCost: materialCost + wasteCost,
            cuts: monthCuts.length,
          })
        }

        setMonthlyCosts(monthlyData)

        const materialStats = cutsData.reduce(
          (acc, cut) => {
            const material = cut.roll?.material_type || "Unknown"
            const costPerSqft = cut.roll?.cost_per_sqft || 2.5

            if (!acc[material]) {
              acc[material] = {
                materialType: material,
                totalCost: 0,
                wasteCost: 0,
                cuts: 0,
              }
            }

            acc[material].totalCost += (cut.total_sqft_used || 0) * costPerSqft
            acc[material].wasteCost += (cut.waste_sqft || 0) * costPerSqft
            acc[material].cuts += 1

            return acc
          },
          {} as Record<
            string,
            {
              materialType: string
              totalCost: number
              wasteCost: number
              cuts: number
            }
          >
        )

        const materialCostData: MaterialCost[] = (
          Object.values(materialStats) as {
            materialType: string
            totalCost: number
            wasteCost: number
            cuts: number
          }[]
        )
          .map((stat) => ({
            materialType: stat.materialType,
            totalCost: stat.totalCost,
            wasteCost: stat.wasteCost,
            cuts: stat.cuts,
            utilizationCost: stat.totalCost - stat.wasteCost,
            avgCostPerCut: stat.cuts > 0 ? stat.totalCost / stat.cuts : 0,
          }))
          .sort((a, b) => b.totalCost - a.totalCost)

        setMaterialCosts(materialCostData)
      } catch (error) {
        console.error("Error fetching cost data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCostData()
  }, [selectedPeriod])

  const totalCost = monthlyCosts.reduce((sum, month) => sum + month.totalCost, 0)
  const totalWasteCost = monthlyCosts.reduce((sum, month) => sum + month.wasteCost, 0)
  const totalUtilizationCost = totalCost - totalWasteCost
  const wastePercentage = totalCost > 0 ? (totalWasteCost / totalCost) * 100 : 0

  const exportReport = () => {
    const headers = [
      "Period",
      "Material Type",
      "Total Cost",
      "Utilization Cost",
      "Waste Cost",
      "Waste %",
    ]
    const rows: (string | number)[][] = []

    monthlyCosts.forEach((month) => {
      rows.push([
        month.period,
        "All Materials",
        `$${month.totalCost.toFixed(2)}`,
        `$${(month.totalCost - month.wasteCost).toFixed(2)}`,
        `$${month.wasteCost.toFixed(2)}`,
        `${(month.totalCost > 0 ? (month.wasteCost / month.totalCost) * 100 : 0).toFixed(1)}%`,
      ])
    })

    rows.push(["", "", "", "", "", ""])
    rows.push(["Material Breakdown", "", "", "", "", ""])
    materialCosts.forEach((data) => {
      rows.push([
        "Current Period",
        data.materialType,
        `$${data.totalCost.toFixed(2)}`,
        `$${data.utilizationCost.toFixed(2)}`,
        `$${data.wasteCost.toFixed(2)}`,
        `${(data.totalCost > 0 ? (data.wasteCost / data.totalCost) * 100 : 0).toFixed(1)}%`,
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
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cost Reports</h1>
          <p className="text-muted-foreground">
            Analyze material costs, waste expenses, and spending patterns
          </p>
        </div>
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
        totalUtilizationCost={totalUtilizationCost}
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
