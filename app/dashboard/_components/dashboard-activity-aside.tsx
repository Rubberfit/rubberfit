"use client"

import { useRouter } from "next/navigation"
import { Package, Scissors, AlertTriangle, Plus, Clock, ArrowRight } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  ActivityFeedRow,
  type ActivityIntent,
  EmptyState,
  EntityRow,
} from "@/app/components/patterns"
import { useRole } from "@/src/infrastructure/services/useRole"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import { formatAreaSqft } from "@/src/application/preferences/user-unit-display"

interface DashboardAsideProps {
  loading: boolean
  lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }>
  recentActivity: Array<{
    type: "cut" | "roll_added" | "roll_depleted"
    description: string
    timestamp: string
  }>
  formatDate: (dateString: string) => string
}

const activityIcon = {
  cut: <Scissors />,
  roll_added: <Plus />,
  roll_depleted: <AlertTriangle />,
} as const

// Per Kimi's §6: each event class gets a semantic icon background so
// the timeline reads at a glance without scanning copy. Cuts are the
// healthy-flow event (green), new stock is contextual (accent),
// depletion is a supervisor-attention event (warning, not danger —
// red is reserved for true failures).
const activityIntent: Record<keyof typeof activityIcon, ActivityIntent> = {
  cut: "success",
  roll_added: "accent",
  roll_depleted: "warning",
}

export function DashboardSidebar({
  loading,
  lowStockMaterials,
  recentActivity,
  formatDate,
}: DashboardAsideProps) {
  const router = useRouter()
  const { can } = useRole()
  const organizationPreferences = useOrganizationPreferences()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Low stock · reorder needed */}
      <section className="flex flex-col gap-3">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Inventory alerts
            </p>
            <h2 className="mt-1 font-display font-semibold text-foreground text-xl tracking-tight">
              Low stock <span className="text-muted-foreground font-normal">· reorder needed</span>
            </h2>
          </div>
          {can("manageRolls") && lowStockMaterials.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push("/dashboard/inventory/reorder")}
            >
              View all
              <ArrowRight className="size-3" />
            </Button>
          )}
        </header>
        <Card className="overflow-hidden p-0">
          {loading ? (
            <div className="p-6 text-muted-foreground text-sm">Loading…</div>
          ) : lowStockMaterials.length === 0 ? (
            <EmptyState
              className="border-0 bg-transparent"
              variant="informational"
              icon={<Package />}
              title="All good"
              description="Every material is above its minimum stock threshold."
            />
          ) : (
            <ul className="divide-y">
              {lowStockMaterials.map((material, index) => (
                <li key={index}>
                  <EntityRow
                    density="compact"
                    title={material.materialType}
                    subtitle={`Threshold ${formatAreaSqft(material.threshold, organizationPreferences, { precision: 0 })}`}
                    metadata={
                      // Signal-orange hairline — "reorder soon", not red
                      // "we're stopped". Kimi §6: red is for true
                      // failures; orange is the attention/threshold colour.
                      <span className="font-mono tabular text-sm text-primary inline-flex items-center rounded-sm border border-primary/30 px-1.5 py-0.5">
                        {formatAreaSqft(material.currentStock, organizationPreferences, {
                          precision: 1,
                        })}
                      </span>
                    }
                    trailing={
                      can("manageRolls") && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="font-mono text-[10px] font-medium uppercase tracking-[0.12em]"
                          onClick={() =>
                            router.push(
                              `/dashboard/inventory/purchase-orders?material=${encodeURIComponent(material.materialType)}`
                            )
                          }
                        >
                          <Plus className="size-3" />
                          Create PO
                        </Button>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Recent activity */}
      <section className="flex flex-col gap-3">
        <header className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Floor log
            </p>
            <h2 className="mt-1 font-display font-semibold text-foreground text-xl tracking-tight">
              Recent activity
            </h2>
          </div>
          {can("viewCutHistory") && (
            <Button size="sm" variant="ghost" onClick={() => router.push("/dashboard/history")}>
              View history
              <ArrowRight className="size-3" />
            </Button>
          )}
        </header>
        <Card className="p-4">
          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : recentActivity.length === 0 ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Clock className="size-4" />
              No recent activity
            </div>
          ) : (
            <div className="space-y-0">
              {recentActivity.map((activity, index) => (
                <ActivityFeedRow
                  key={index}
                  icon={activityIcon[activity.type]}
                  intent={activityIntent[activity.type]}
                  title={activity.description}
                  timestamp={formatDate(activity.timestamp)}
                  isLast={index === recentActivity.length - 1}
                />
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  )
}
