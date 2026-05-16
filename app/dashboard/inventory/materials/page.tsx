"use client"

import { useEffect, useMemo, useState } from "react"
import { Database, Package } from "lucide-react"

import { type MaterialType } from "@/src/entities/material-type"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { PageHeader, PageShell, StatCard } from "@/app/components/patterns"

import { MaterialTypesOverview } from "./_components/material-types-overview"
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

  const { totalMaterialTypes, totalAlertThreshold } = useMemo(
    () => ({
      totalMaterialTypes: materialTypes.length,
      totalAlertThreshold: materialTypes.reduce((sum, m) => sum + (m.minStockSqm ?? 0), 0),
    }),
    [materialTypes]
  )

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

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          label="Material types"
          icon={<Database />}
          value={totalMaterialTypes}
          footnote="Active"
          sparkIntent="accent"
        />
        <StatCard
          label="Alert thresholds"
          icon={<Package />}
          value={totalAlertThreshold.toFixed(0)}
          footnote="Combined sqm"
          sparkIntent="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MaterialTypesOverview />
        <SupplierOverview />
      </div>
    </PageShell>
  )
}
