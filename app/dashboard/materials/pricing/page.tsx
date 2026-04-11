"use client"

import { useEffect, useState, useMemo } from "react"
import { Download } from "lucide-react"
import { format } from "date-fns"

import { type MaterialType, type MaterialSupplierWithDetails, type Supplier } from "@/app/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { exportService } from "@/src/infrastructure/services/exportService"
import { toast } from "sonner"
import type {
  PriceHistoryWithJoins,
  PriceComparisonData,
  PriceAlert,
} from "./_components/pricing-types"
import { fetchPricingData } from "./_components/pricing-data"
import { PricingHistoryTable } from "./_components/pricing-history-table"
import { PricingStatsCards } from "./_components/pricing-stats-cards"
import { PricingComparisonTable } from "./_components/pricing-comparison-table"
import { PricingAlertsCard } from "./_components/pricing-alerts-card"
import { PricingHistoryChart } from "./_components/pricing-history-chart"

export default function PricingPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceHistoryWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all")
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all")
  const [dateRange, setDateRange] = useState<string>("30")
  const [searchQuery, setSearchQuery] = useState("")
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchPricingData(dateRange)
        setMaterialTypes(result.materialTypes)
        setSuppliers(result.suppliers)
        setMaterialSuppliers(result.materialSuppliers)
        setPriceHistory(result.priceHistory)
        setPriceAlerts(result.priceAlerts)
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [dateRange])

  // Prepare price comparison data
  const priceComparisonData = useMemo(() => {
    const comparison: PriceComparisonData[] = []

    materialTypes.forEach((material) => {
      const supplierPrices = materialSuppliers
        .filter((ms) => ms.material_type_id === material.id)
        .map((ms) => ({
          supplierId: ms.supplier_id,
          supplierName: ms.supplier?.name || "Unknown",
          currentPrice: ms.cost_per_sqft,
          leadTime: ms.lead_time_days || 0,
          minOrder: ms.minimum_order_sqft || 0,
          isPreferred: ms.preferred_supplier,
          lastChange: undefined,
          priceHistory: [],
        }))

      if (supplierPrices.length > 0) {
        const prices = supplierPrices.map((s) => s.currentPrice)
        comparison.push({
          materialTypeId: material.id,
          materialName: material.name,
          suppliers: supplierPrices,
          bestPrice: Math.min(...prices),
          avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
          priceRange: {
            min: Math.min(...prices),
            max: Math.max(...prices),
          },
        })
      }
    })

    return comparison
  }, [materialTypes, materialSuppliers])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (selectedMaterial === "all" || !selectedMaterial) return []

    const material = priceComparisonData.find((m) => m.materialTypeId === selectedMaterial)
    if (!material) return []

    const dataMap = new Map<string, Record<string, unknown>>()

    priceHistory
      .filter((h) => h.material_supplier?.material_type_id === selectedMaterial)
      .forEach((h) => {
        const rawDate = String(h.created_at).replace(" ", "T")
        const date = format(new Date(rawDate), "MMM dd")
        const supplierName = h.material_supplier?.supplier?.name || "Unknown"

        if (!dataMap.has(date)) {
          dataMap.set(date, { date, _sortTs: new Date(rawDate).getTime() })
        }

        const entry = dataMap.get(date)!
        entry[supplierName] = h.new_cost_per_sqft
      })

    return Array.from(dataMap.values()).sort(
      (a, b) => (Number(a._sortTs) || 0) - (Number(b._sortTs) || 0)
    )
  }, [selectedMaterial, priceHistory, priceComparisonData])

  // Filter price history based on selected material
  const filteredPriceHistory = useMemo(() => {
    if (selectedMaterial === "all") return priceHistory
    return priceHistory.filter((h) => h.material_supplier?.material_type_id === selectedMaterial)
  }, [priceHistory, selectedMaterial])

  // Filter data based on search
  const filteredComparisonData = useMemo(() => {
    return priceComparisonData.filter((item) => {
      if (searchQuery && !item.materialName.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      if (selectedMaterial !== "all" && item.materialTypeId !== selectedMaterial) {
        return false
      }
      return true
    })
  }, [priceComparisonData, searchQuery, selectedMaterial])

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Pricing Dashboard</h1>
        <p className="text-muted-foreground">
          Compare prices across suppliers and track historical trends
        </p>
      </div>
      <PricingStatsCards
        suppliers={suppliers}
        materialSuppliers={materialSuppliers}
        priceAlerts={priceAlerts}
        priceComparisonData={priceComparisonData}
      />
      <PricingAlertsCard priceAlerts={priceAlerts} dateRange={dateRange} />
      <Tabs defaultValue="comparison" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comparison">Price Comparison</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>
        <TabsContent value="comparison">
          <PricingComparisonTable
            loading={loading}
            materialTypes={materialTypes}
            suppliers={suppliers}
            selectedMaterial={selectedMaterial}
            setSelectedMaterial={setSelectedMaterial}
            selectedSupplier={selectedSupplier}
            setSelectedSupplier={setSelectedSupplier}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filteredComparisonData={filteredComparisonData}
          />
        </TabsContent>
        <TabsContent value="history" className="space-y-4">
          <PriceHistorySettings
            materialTypes={materialTypes}
            selectedMaterial={selectedMaterial}
            setSelectedMaterial={setSelectedMaterial}
            dateRange={dateRange}
            setDateRange={setDateRange}
            filteredPriceHistory={filteredPriceHistory}
          />
          <PricingHistoryChart
            selectedMaterial={selectedMaterial}
            chartData={chartData}
            suppliers={suppliers}
            filteredPriceHistoryLength={filteredPriceHistory.length}
          />
          <Card>
            <CardHeader>
              <CardTitle>Price Change Records</CardTitle>
              <CardDescription>
                {selectedMaterial === "all"
                  ? `All price changes in the last ${dateRange} days`
                  : `Price changes for selected material in the last ${dateRange} days`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <PricingHistoryTable
                  loading={loading}
                  filteredPriceHistory={filteredPriceHistory}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function PriceHistorySettings({
  materialTypes,
  selectedMaterial,
  setSelectedMaterial,
  dateRange,
  setDateRange,
  filteredPriceHistory,
}: {
  materialTypes: MaterialType[]
  selectedMaterial: string
  setSelectedMaterial: (value: string) => void
  dateRange: string
  setDateRange: (value: string) => void
  filteredPriceHistory: PriceHistoryWithJoins[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Price History Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Select Material" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Materials</SelectItem>
              {materialTypes.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const filtered = filteredPriceHistory
              if (filtered.length === 0) {
                toast.error("No price history data to export")
                return
              }
              const rows = filtered.map((h) => {
                let dateStr = ""
                try {
                  const raw = h.effective_date || h.created_at
                  dateStr = raw ? format(new Date(String(raw).replace(" ", "T")), "yyyy-MM-dd") : ""
                } catch (_error) {
                  dateStr = h.effective_date || h.created_at || ""
                }
                return [
                  dateStr,
                  h.material_supplier?.material_type?.name || "Unknown",
                  h.material_supplier?.supplier?.name || "Unknown",
                  h.old_cost_per_sqft != null ? Number(h.old_cost_per_sqft).toFixed(2) : "N/A",
                  h.new_cost_per_sqft != null ? Number(h.new_cost_per_sqft).toFixed(2) : "N/A",
                  h.price_change_percentage != null
                    ? Number(h.price_change_percentage).toFixed(1)
                    : "N/A",
                  h.change_reason || "",
                ]
              })
              exportService.exportToCSV({
                headers: [
                  "Date",
                  "Material",
                  "Supplier",
                  "Old Price ($/sqft)",
                  "New Price ($/sqft)",
                  "Change %",
                  "Reason",
                ],
                rows,
                filename: "price_history",
              })
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Export History
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
