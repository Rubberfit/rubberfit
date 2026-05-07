"use client"

import { useEffect, useState } from "react"
import { Database, DollarSign, Package, TrendingUp } from "lucide-react"

import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { PageHeader, PageShell, StatCard } from "@/app/components/patterns"

import { MaterialTypesOverview } from "./_components/material-types-overview"
import { PricingTrends } from "./_components/pricing-trends"
import { SupplierOverview } from "./_components/supplier-overview"

export default function MaterialsPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMaterialTypes = async () => {
      setLoading(true)
      try {
        const data = await materialTypeService.getAll()
        setMaterialTypes(data)
      } catch (error) {
        console.error("Error fetching material types:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMaterialTypes()
  }, [])

  const totalMaterialTypes = materialTypes.length
  // Filter out null/undefined costs before aggregating — a missing
  // `default_cost` is "unset," not "$0," and treating it as zero
  // pollutes the average and pins the cost-range floor at $0.
  const materialCosts = materialTypes
    .map((m) => m.default_cost)
    .filter((cost): cost is number => cost != null)
  const averageCost =
    materialCosts.length > 0
      ? materialCosts.reduce((sum, c) => sum + c, 0) / materialCosts.length
      : 0
  const totalAlertThreshold = materialTypes.reduce((sum, m) => sum + (m.min_stock_alert ?? 0), 0)
  const minCost = materialCosts.length > 0 ? Math.min(...materialCosts) : null
  const maxCost = materialCosts.length > 0 ? Math.max(...materialCosts) : null

  if (loading) {
    return (
      <PageShell variant="overview">
        <PageHeader title="Materials" subtitle="Loading…" />
      </PageShell>
    )
  }

  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials" },
        ]}
        title="Materials"
        subtitle="Material types, suppliers, and pricing. Catalog that drives every cut job."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Material types"
          icon={<Database />}
          value={totalMaterialTypes}
          footnote="Active"
          sparkIntent="accent"
        />
        <StatCard
          label="Avg cost"
          icon={<DollarSign />}
          value={`$${averageCost.toFixed(2)}`}
          footnote="Per sq ft"
          sparkIntent="accent"
        />
        <StatCard
          label="Alert thresholds"
          icon={<Package />}
          value={totalAlertThreshold.toFixed(0)}
          footnote="Combined sqft"
          sparkIntent="warning"
        />
        <StatCard
          label="Cost range"
          icon={<TrendingUp />}
          value={
            minCost != null && maxCost != null
              ? `$${minCost.toFixed(2)} – $${maxCost.toFixed(2)}`
              : "—"
          }
          footnote="Per sq ft"
          sparkIntent="accent"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MaterialTypesOverview />
        <SupplierOverview />
      </div>

      <PricingTrends />
    </PageShell>
  )
}
