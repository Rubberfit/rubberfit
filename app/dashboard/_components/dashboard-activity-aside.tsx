"use client"

import { useRouter } from "next/navigation"
import { Package, Scissors, AlertTriangle, Plus, Clock, ArrowRight } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import {
  ActivityFeedRow,
  EmptyState,
  EntityRow,
  StatusBadge,
} from "@/app/components/patterns"
import { useRole } from "@/src/infrastructure/services/useRole"

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

export function DashboardSidebar({
  loading,
  lowStockMaterials,
  recentActivity,
  formatDate,
}: DashboardAsideProps) {
  const router = useRouter()
  const { can } = useRole()

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Low stock · reorder needed */}
      <section className="flex flex-col gap-3">
        <header className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">
            Low stock <span className="text-muted-foreground">· reorder needed</span>
          </h2>
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
                    subtitle={`Threshold ${material.threshold.toFixed(0)} sqft`}
                    metadata={
                      <span className="tabular">
                        <StatusBadge intent="danger" variant="outline">
                          {material.currentStock.toFixed(1)} sqft
                        </StatusBadge>
                      </span>
                    }
                    trailing={
                      can("manageRolls") && (
                        <Button
                          size="sm"
                          variant="outline"
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
        <header className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-sm">Recent activity</h2>
          {can("viewCutHistory") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push("/dashboard/history")}
            >
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
