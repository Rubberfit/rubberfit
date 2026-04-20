"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Database, Package, DollarSign, TrendingUp, ArrowRight } from "lucide-react"

import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { Card } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  PageHeader,
  PageShell,
  StatCard,
} from "@/app/components/patterns"

import { MaterialTypesOverview } from "./_components/material-types-overview"
import { SupplierOverview } from "./_components/supplier-overview"
import { PricingTrends } from "./_components/pricing-trends"

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
    materialTypes.length > 0
      ? Math.min(...materialTypes.map((m) => m.default_cost || 0))
      : 0
  const maxCost =
    materialTypes.length > 0
      ? Math.max(...materialTypes.map((m) => m.default_cost || 0))
      : 0

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

      <div className="grid gap-4 md:grid-cols-3">
        <QuickLinkCard
          href="/dashboard/inventory/materials/types"
          icon={<Database />}
          title="Material Types"
          description="Categories, durometers, minimum stock alerts"
          primary
        />
        <QuickLinkCard
          href="/dashboard/inventory/materials/suppliers"
          icon={<Package />}
          title="Suppliers"
          description="Profiles, shipping preferences, performance"
        />
        <QuickLinkCard
          href="/dashboard/inventory/materials/pricing"
          icon={<DollarSign />}
          title="Pricing"
          description="Cost tracking, alerts, historical trends"
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

function QuickLinkCard({
  href,
  icon,
  title,
  description,
  primary,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
  primary?: boolean
}) {
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-ring">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-muted-foreground text-xs">{description}</p>
        </div>
      </div>
      <Button asChild size="sm" variant={primary ? "default" : "outline"}>
        <Link href={href}>
          Open
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </Card>
  )
}
