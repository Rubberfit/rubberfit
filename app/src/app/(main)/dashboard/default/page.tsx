"use client"

import { useEffect, useState } from "react"
import { type Roll, type Cut, type MaterialType } from "@/lib/supabase"
import { rollService } from "@/services/rollService"
import { cutService } from "@/services/cutService"
import { materialTypeService } from "@/services/materialTypeService"
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

        // Fetch all data via service layer (parallel where possible)
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
            return [] as (Cut & { roll?: { material_type: string; location: string } })[]
          }),
          rollService.getRecentRolls(5).catch((err) => {
            console.error("Error fetching recent rolls:", err)
            return [] as Roll[]
          }),
          cutService.getWasteTrendByWeek(8).catch((err) => {
            console.error("Error fetching waste trend:", err)
            return [] as { period: string; wastePercentage: number }[]
          }),
        ])

        // Calculate metrics
        const totalActiveRolls = activeRolls.length

        // Calculate inventory value: Sum(remaining_length x width x cost_per_sqft / 144)
        const inventoryValue = activeRolls.reduce((total, roll) => {
          const sqft = (roll.remaining_length * roll.width) / 144
          const value = sqft * (roll.cost_per_sqft || 0)
          return total + value
        }, 0)

        const cutsThisWeek = cutsThisWeekData.length

        // Calculate average waste percentage from this month
        const wastePercentage =
          monthWasteData.length > 0
            ? monthWasteData.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) /
              monthWasteData.length
            : 0

        // Calculate low stock materials
        const lowStockMaterials: Array<{
          materialType: string
          currentStock: number
          threshold: number
        }> = []

        if (materialTypes.length > 0 && activeRolls.length > 0) {
          for (const materialType of materialTypes) {
            const materialRolls = activeRolls.filter(
              (roll) => roll.material_type === materialType.name
            )
            const currentStock = materialRolls.reduce((total, roll) => {
              return total + (roll.remaining_length * roll.width) / 144
            }, 0)

            if (currentStock < (materialType.min_stock_alert || 0)) {
              lowStockMaterials.push({
                materialType: materialType.name,
                currentStock,
                threshold: materialType.min_stock_alert || 0,
              })
            }
          }
        }

        // Build recent activity feed
        const activity: Array<{
          type: "cut" | "roll_added" | "roll_depleted"
          description: string
          timestamp: string
        }> = []

        // Add recent cuts
        if (recentCutsData) {
          recentCutsData.forEach((cut) => {
            const rollInfo = cut.roll as { material_type: string; location: string } | undefined
            activity.push({
              type: "cut",
              description: `Cut ${cut.cut_width}" × ${cut.cut_length}" × ${cut.quantity} from ${rollInfo?.material_type || "Unknown"} roll`,
              timestamp: cut.created_at,
            })
          })
        }

        // Add recent rolls
        if (recentRollsData) {
          recentRollsData.forEach((roll) => {
            activity.push({
              type: roll.status === "depleted" ? "roll_depleted" : "roll_added",
              description: `${roll.status === "depleted" ? "Depleted" : "Added"} ${roll.material_type} roll ${roll.width}" × ${roll.length}"`,
              timestamp: roll.created_at,
            })
          })
        }

        // Sort activity by timestamp and take top 10
        activity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        const recentActivity = activity.slice(0, 10)

        // Calculate material summary for chart
        const materialSummary: Array<{ name: string; sqft: number; rolls: number }> = []

        if (materialTypes.length > 0 && activeRolls.length > 0) {
          for (const materialType of materialTypes) {
            const materialRolls = activeRolls.filter(
              (roll) => roll.material_type === materialType.name
            )
            if (materialRolls.length > 0) {
              const totalSqft = materialRolls.reduce((total, roll) => {
                return total + (roll.remaining_length * roll.width) / 144
              }, 0)

              materialSummary.push({
                name: materialType.name,
                sqft: totalSqft,
                rolls: materialRolls.length,
              })
            }
          }
        }

        // Sort by sqft descending
        materialSummary.sort((a, b) => b.sqft - a.sqft)

        // Filter waste trend to only include weeks with data (match original behavior)
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
        <p className="text-muted-foreground">RubberFit Pro Operations Overview</p>
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
