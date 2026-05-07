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
  const averageCost =
    materialTypes.length > 0
      ? materialTypes.reduce((sum, m) => sum + (m.default_cost || 0), 0) / materialTypes.length
      : 0
  const totalAlertThreshold = materialTypes.reduce((sum, m) => sum + (m.min_stock_alert || 0), 0)
  const minCost =
    materialTypes.length > 0 ? Math.min(...materialTypes.map((m) => m.default_cost || 0)) : 0
  const maxCost =
    materialTypes.length > 0 ? Math.max(...materialTypes.map((m) => m.default_cost || 0)) : 0

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
          value={materialTypes.length > 0 ? `$${minCost.toFixed(2)} – $${maxCost.toFixed(2)}` : "—"}
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
