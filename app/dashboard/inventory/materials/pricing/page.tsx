"use client"

import { useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

import {
  type MaterialSupplierWithDetails,
  type MaterialType,
} from "@/src/infrastructure/models/supabase"
import type { SupplierSnapshot } from "@/src/entities/supplier"
import { exportService } from "@/src/infrastructure/services/exportService"
import { fetchPricingPageData } from "@/src/infrastructure/services/pricingPageService"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"
import { PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"

import { MaterialCostsTable } from "./_components/material-costs-table"
import { PricingAlertsCard } from "./_components/pricing-alerts-card"
import { PricingComparisonTable } from "./_components/pricing-comparison-table"
import { PricingHistoryChart } from "./_components/pricing-history-chart"
import { PricingHistoryTable } from "./_components/pricing-history-table"
import { PricingStatsCards } from "./_components/pricing-stats-cards"
import type {
  PriceAlert,
  PriceComparisonData,
  PriceHistoryWithJoins,
} from "./_components/pricing-types"

export default function PricingPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<SupplierSnapshot[]>([])
  const [materialSuppliers, setMaterialSuppliers] = useState<MaterialSupplierWithDetails[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceHistoryWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMaterial, setSelectedMaterial] = useState<string>("all")
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all")
  const [dateRange, setDateRange] = useState<string>("30")
  const [searchQuery, setSearchQuery] = useState("")
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([])

  useEffect(() => {
    let cancelled = false
    const loadData = async () => {
      try {
        setLoading(true)
        const result = await fetchPricingPageData(dateRange)
        if (cancelled) return
        setMaterialTypes(result.materialTypes)
        setSuppliers(result.suppliers)
        setMaterialSuppliers(result.materialSuppliers)
        setPriceHistory(result.priceHistory)
        setPriceAlerts(result.priceAlerts)
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [dateRange])

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

  const filteredPriceHistory = useMemo(() => {
    if (selectedMaterial === "all") return priceHistory
    return priceHistory.filter((h) => h.material_supplier?.material_type_id === selectedMaterial)
  }, [priceHistory, selectedMaterial])

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

  const handleExportHistory = () => {
    if (filteredPriceHistory.length === 0) {
      toast.error("No price history data to export")
      return
    }
    const rows = filteredPriceHistory.map((h) => {
      let dateStr = ""
      try {
        const raw = h.effective_date ?? h.created_at
        dateStr = raw ? format(new Date(String(raw).replace(" ", "T")), "yyyy-MM-dd") : ""
      } catch (_error) {
        dateStr = String(h.effective_date ?? h.created_at ?? "")
      }
      return [
        dateStr,
        h.material_supplier?.material_type?.name ?? "Unknown",
        h.material_supplier?.supplier?.name ?? "Unknown",
        h.old_cost_per_sqft != null ? Number(h.old_cost_per_sqft).toFixed(2) : "N/A",
        h.new_cost_per_sqft != null ? Number(h.new_cost_per_sqft).toFixed(2) : "N/A",
        h.price_change_percentage != null ? Number(h.price_change_percentage).toFixed(1) : "N/A",
        h.change_reason ?? "",
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
  }

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials", href: "/dashboard/inventory/materials" },
          { label: "Pricing" },
        ]}
        title="Pricing"
        subtitle="Cost tracking, supplier price comparison, and change alerts."
      />

      <PricingStatsCards
        materialTypes={materialTypes}
        suppliers={suppliers}
        materialSuppliers={materialSuppliers}
        priceAlerts={priceAlerts}
      />

      <PricingAlertsCard priceAlerts={priceAlerts} dateRange={dateRange} />

      <Tabs defaultValue="costs" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="costs">Material costs</TabsTrigger>
          <TabsTrigger value="comparison">Price comparison</TabsTrigger>
          <TabsTrigger value="history">Price history</TabsTrigger>
        </TabsList>

        <TabsContent value="costs">
          <MaterialCostsTable
            loading={loading}
            materialTypes={materialTypes}
            materialSuppliers={materialSuppliers}
          />
        </TabsContent>

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
          <ViewToolbar
            hideSearch
            filters={
              <>
                <Select value={selectedMaterial} onValueChange={setSelectedMaterial}>
                  <SelectTrigger className="h-9 w-[220px] text-sm">
                    <SelectValue placeholder="All materials" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All materials</SelectItem>
                    {materialTypes.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger className="h-9 w-[180px] text-sm">
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
              </>
            }
            actions={
              <Button variant="outline" size="sm" onClick={handleExportHistory}>
                <Download className="size-3.5" aria-hidden="true" />
                Export history
              </Button>
            }
          />

          <PricingHistoryChart
            selectedMaterial={selectedMaterial}
            chartData={chartData}
            suppliers={suppliers}
            filteredPriceHistoryLength={filteredPriceHistory.length}
          />

          <Card>
            <CardHeader>
              <CardTitle>Price change records</CardTitle>
              <CardDescription>
                {selectedMaterial === "all"
                  ? `All price changes in the last ${dateRange} days.`
                  : `Price changes for the selected material in the last ${dateRange} days.`}
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
    </PageShell>
  )
}
