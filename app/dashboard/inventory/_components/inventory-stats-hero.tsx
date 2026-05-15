"use client"

import { DollarSign, Layers, Package, TrendingDown } from "lucide-react"

import { StatCard } from "@/app/components/patterns"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  getAreaUnitLabel,
  getDisplayAreaValue,
} from "@/src/application/preferences/user-unit-display"

import { useInventoryStats } from "./use-inventory-stats"

interface InventoryStatsHeroProps {
  refreshKey?: number
}

export function InventoryStatsHero({ refreshKey }: InventoryStatsHeroProps) {
  const organizationPreferences = useOrganizationPreferences()
  const areaUnit = getAreaUnitLabel(organizationPreferences)
  const { activeCount, totalSqft, lowStockCount, totalValueUsd, isLoading } =
    useInventoryStats(refreshKey)

  const totalAreaLabel = isLoading
    ? "—"
    : getDisplayAreaValue(totalSqft, organizationPreferences).toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total active rolls"
        value={isLoading ? "—" : activeCount.toLocaleString()}
        icon={<Package />}
      />
      <StatCard
        label={`Total ${areaUnit}`}
        value={totalAreaLabel}
        unit={areaUnit}
        icon={<Layers />}
      />
      <StatCard
        label="Low-stock count"
        value={isLoading ? "—" : lowStockCount.toLocaleString()}
        icon={<TrendingDown />}
      />
      <StatCard
        label="Total value"
        value={
          isLoading
            ? "—"
            : `$${totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        }
        icon={<DollarSign />}
      />
    </div>
  )
}
