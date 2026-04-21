"use client"

import { useEffect, useState } from "react"
import { type Roll, type Cut, type MaterialType } from "@/src/entities"
import { rollService } from "@/src/infrastructure/services/rollService"
import { cutService } from "@/src/infrastructure/services/cutService"
import type { CutWithRoll, WasteTrend } from "@/src/application/services/cut.service.interface"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { MaterialSummaryChart } from "../_components/material-summary-chart"
import { WasteTrendChart } from "../_components/waste-trend-chart"
import { SummaryCards } from "./_components/summary-cards"
import { DashboardSidebar } from "./_components/dashboard-sidebar"

interface DashboardData {
  totalActiveRolls: number
  inventoryValue: number
  cutsThisWeek: number
  wastePercentage: number
  lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }>
  recentActivity: Array<{
    type: "cut" | "roll_added" | "roll_depleted"
    description: string
    timestamp: string
  }>
  materialSummary: Array<{ name: string; sqft: number; rolls: number }>
  wasteTrend: Array<{ period: string; wastePercentage: number }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    totalActiveRolls: 0,
    inventoryValue: 0,
    cutsThisWeek: 0,
    wastePercentage: 0,
    lowStockMaterials: [],
    recentActivity: [],
    materialSummary: [],
    wasteTrend: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)

        const [
          activeRolls,
          cutsThisWeekData,
          monthWasteData,
          materialTypes,
          recentCutsData,
          recentRollsData,
          wasteTrendData,
        ] = await Promise.all([
          rollService.getActiveRolls().catch((err) => {
            console.error("Error fetching rolls:", err)
            return [] as Roll[]
          }),
          cutService.getCutsThisWeek().catch((err) => {
            console.error("Error fetching cuts:", err)
            return [] as Cut[]
          }),
          cutService.getMonthlyWastePercentages().catch((err) => {
            console.error("Error fetching month cuts:", err)
            return [] as { waste_percentage: number }[]
          }),
          materialTypeService.getAll().catch((err) => {
            console.error("Error fetching material types:", err)
            return [] as MaterialType[]
          }),
          cutService.getRecentCutsWithRolls(5).catch((err) => {
            console.error("Error fetching recent cuts:", err)
            return [] as CutWithRoll[]
          }),
          rollService.getRecentRolls(5).catch((err) => {
            console.error("Error fetching recent rolls:", err)
            return [] as Roll[]
          }),
          cutService.getWasteTrendByWeek(8).catch((err) => {
            console.error("Error fetching waste trend:", err)
            return [] as WasteTrend[]
          }),
        ])

        const materialTypesById = new Map(materialTypes.map((m) => [m.id, m.name]))

        const totalActiveRolls = activeRolls.length

        // Inventory value in dollars. Area = width_mm × remaining_length_mm → sqft;
        // price = cost-per-sqm-cents converted to $/sqft.
        const inventoryValue = activeRolls.reduce((total, roll) => {
          const sqft = (roll.remainingLength.toInches() * roll.width.toInches()) / 144
          const dollarsPerSqft = roll.costPerArea?.toDollarsPerSqft() ?? 0
          return total + sqft * dollarsPerSqft
        }, 0)

        const cutsThisWeek = cutsThisWeekData.length

        const wastePercentage =
          monthWasteData.length > 0
            ? monthWasteData.reduce((sum, c) => sum + (c.waste_percentage || 0), 0) /
              monthWasteData.length
            : 0

        const lowStockMaterials: Array<{
          materialType: string
          currentStock: number
          threshold: number
        }> = []

        if (materialTypes.length > 0 && activeRolls.length > 0) {
          for (const materialType of materialTypes) {
            const materialRolls = activeRolls.filter(
              (roll) => roll.materialTypeId === materialType.id
            )
            const currentStockSqft = materialRolls.reduce((total, roll) => {
              return (
                total + (roll.remainingLength.toInches() * roll.width.toInches()) / 144
              )
            }, 0)
            const thresholdSqft = materialType.minStock?.toSqft() ?? 0

            if (thresholdSqft > 0 && currentStockSqft < thresholdSqft) {
              lowStockMaterials.push({
                materialType: materialType.name,
                currentStock: currentStockSqft,
                threshold: thresholdSqft,
              })
            }
          }
        }

        const activity: Array<{
          type: "cut" | "roll_added" | "roll_depleted"
          description: string
          timestamp: string
        }> = []

        recentCutsData.forEach((cut) => {
          const materialName = cut.roll?.materialTypeName ?? "Unknown"
          activity.push({
            type: "cut",
            description: `Cut ${cut.cutWidth.toInches().toFixed(1)}" × ${cut.cutLength
              .toInches()
              .toFixed(1)}" × ${cut.quantity} from ${materialName} roll`,
            timestamp: cut.createdAt,
          })
        })

        recentRollsData.forEach((roll) => {
          const materialName = materialTypesById.get(roll.materialTypeId) ?? "Unknown"
          activity.push({
            type: roll.status === "depleted" ? "roll_depleted" : "roll_added",
            description: `${roll.status === "depleted" ? "Depleted" : "Added"} ${materialName} roll ${roll.width
              .toInches()
              .toFixed(1)}" × ${roll.length.toInches().toFixed(1)}"`,
            timestamp: roll.createdAt,
          })
        })

        activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        const recentActivity = activity.slice(0, 10)

        const materialSummary: Array<{ name: string; sqft: number; rolls: number }> = []

        if (materialTypes.length > 0 && activeRolls.length > 0) {
          for (const materialType of materialTypes) {
            const materialRolls = activeRolls.filter(
              (roll) => roll.materialTypeId === materialType.id
            )
            if (materialRolls.length > 0) {
              const totalSqft = materialRolls.reduce((total, roll) => {
                return total + (roll.remainingLength.toInches() * roll.width.toInches()) / 144
              }, 0)
              materialSummary.push({
                name: materialType.name,
                sqft: totalSqft,
                rolls: materialRolls.length,
              })
            }
          }
        }

        materialSummary.sort((a, b) => b.sqft - a.sqft)

        const wasteTrend = wasteTrendData.filter((w) => w.wastePercentage > 0)

        setData({
          totalActiveRolls,
          inventoryValue,
          cutsThisWeek,
          wastePercentage,
          lowStockMaterials,
          recentActivity,
          materialSummary,
          wasteTrend,
        })
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">RubberFit Operations Overview</p>
      </div>

      <SummaryCards
        loading={loading}
        totalActiveRolls={data.totalActiveRolls}
        cutsThisWeek={data.cutsThisWeek}
        wastePercentage={data.wastePercentage}
        inventoryValue={data.inventoryValue}
        formatCurrency={formatCurrency}
      />

      <DashboardSidebar
        loading={loading}
        lowStockMaterials={data.lowStockMaterials}
        recentActivity={data.recentActivity}
        formatDate={formatDate}
      />

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <MaterialSummaryChart data={data.materialSummary} />
        <WasteTrendChart data={data.wasteTrend} />
      </div>
    </div>
  )
}
