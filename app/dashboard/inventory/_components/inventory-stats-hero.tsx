"use client"

import { DollarSign, Layers, Package, TrendingDown } from "lucide-react"

import { StatCard } from "@/app/components/patterns"

import { useInventoryStats } from "./use-inventory-stats"

interface InventoryStatsHeroProps {
  refreshKey?: number
}

export function InventoryStatsHero({ refreshKey }: InventoryStatsHeroProps) {
  const { activeCount, totalSqft, lowStockCount, totalValueUsd, isLoading } =
    useInventoryStats(refreshKey)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total active rolls"
        value={isLoading ? "—" : activeCount.toLocaleString()}
        icon={<Package />}
      />
      <StatCard
        label="Total sqft"
        value={isLoading ? "—" : totalSqft.toLocaleString(undefined, { maximumFractionDigits: 1 })}
        unit="sqft"
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
