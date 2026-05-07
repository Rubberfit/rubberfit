"use client"

import { Activity, AlertTriangle, ShoppingCart, Truck } from "lucide-react"

import { InlineNotice, StatCard } from "@/app/components/patterns"

export interface ReorderStats {
  activeCount: number
  autoCount: number
  reorderCount: number
  criticalCount: number
  estOrderValue: number
  avgLeadTime: number
}

interface ReorderStatsHeroProps {
  stats: ReorderStats
}

export function ReorderStatsHero({ stats }: ReorderStatsHeroProps) {
  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active rules"
          value={stats.activeCount}
          icon={<Activity />}
          footnote={`${stats.autoCount} auto-enabled`}
        />
        <StatCard
          label="Reorder needed"
          value={stats.reorderCount}
          icon={<AlertTriangle />}
          footnote={`${stats.criticalCount} critical`}
          sparkIntent={stats.criticalCount > 0 ? "danger" : "accent"}
        />
        <StatCard
          label="Est. order value"
          value={`$${stats.estOrderValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          icon={<ShoppingCart />}
          footnote={`For ${stats.reorderCount} item${stats.reorderCount === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Avg lead time"
          value={stats.avgLeadTime}
          unit="d"
          icon={<Truck />}
          footnote="Across all materials"
        />
      </div>

      {stats.criticalCount > 0 && (
        <InlineNotice intent="danger" title="Critical stock levels">
          {stats.criticalCount} material{stats.criticalCount === 1 ? "" : "s"} require immediate
          reordering. Expected stockout within 2 days if not actioned.
        </InlineNotice>
      )}
    </section>
  )
}
