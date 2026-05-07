"use client"

import { AlertTriangle, Building2, DollarSign, Layers } from "lucide-react"

import type {
  MaterialSupplierWithDetails,
  MaterialType,
} from "@/src/infrastructure/models/supabase"
import { StatCard } from "@/app/components/patterns"

import type { PriceAlert } from "./pricing-types"

interface PricingStatsCardsProps {
  materialTypes: MaterialType[]
  suppliers: { length: number }
  materialSuppliers: MaterialSupplierWithDetails[]
  priceAlerts: PriceAlert[]
}

export function PricingStatsCards({
  materialTypes,
  suppliers,
  materialSuppliers,
  priceAlerts,
}: PricingStatsCardsProps) {
  const withCost = materialTypes.filter((mt) => mt.default_cost != null)
  const avgCost =
    withCost.length > 0
      ? withCost.reduce((sum, mt) => sum + (mt.default_cost ?? 0), 0) / withCost.length
      : 0
  const increases = priceAlerts.filter((a) => a.type === "increase").length
  const preferredCount = materialSuppliers.filter((ms) => ms.preferred_supplier).length

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Material types"
        icon={<Layers />}
        value={materialTypes.length}
        footnote={`${withCost.length} with costs set`}
      />
      <StatCard
        label="Avg cost"
        icon={<DollarSign />}
        value={`$${avgCost > 0 ? avgCost.toFixed(2) : "0.00"}`}
        footnote="Per square foot"
      />
      <StatCard
        label="Price alerts"
        icon={<AlertTriangle />}
        value={priceAlerts.length}
        footnote={`${increases} increase${increases === 1 ? "" : "s"}`}
        sparkIntent={priceAlerts.length > 0 ? "warning" : "accent"}
      />
      <StatCard
        label="Active suppliers"
        icon={<Building2 />}
        value={suppliers.length}
        footnote={`${preferredCount} preferred`}
      />
    </div>
  )
}
