"use client"

import { useRouter } from "next/navigation"
import { Package, Scissors, AlertTriangle, Plus, Eye, Clock } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useRole } from "@/services/useRole"

interface DashboardSidebarProps {
  loading: boolean
  lowStockMaterials: Array<{ materialType: string; currentStock: number; threshold: number }>
  recentActivity: Array<{
    type: "cut" | "roll_added" | "roll_depleted"
    description: string
    timestamp: string
  }>
  formatDate: (dateString: string) => string
}

export function DashboardSidebar({
  loading,
  lowStockMaterials,
  recentActivity,
  formatDate,
}: DashboardSidebarProps) {
  const router = useRouter()
  const { can } = useRole()

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Low Stock Alerts */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Low Stock Alerts</h2>
        {loading ? (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </CardContent>
          </Card>
        ) : lowStockMaterials.length > 0 ? (
          <div className="space-y-2">
            {lowStockMaterials.map((material, index) => (
              <Alert key={index} variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{material.materialType}</AlertTitle>
                <AlertDescription>
                  Stock: {material.currentStock.toFixed(1)} sqft (threshold: {material.threshold}{" "}
                  sqft)
                </AlertDescription>
              </Alert>
            ))}
          </div>
        ) : (
          <Alert>
            <Package className="h-4 w-4" />
            <AlertTitle>All Good</AlertTitle>
            <AlertDescription>All materials are above minimum stock levels.</AlertDescription>
          </Alert>
        )}

        {/* Quick Action Buttons */}
        <div className="space-y-2">
          <h3 className="text-md font-medium">Quick Actions</h3>
          <div className="flex flex-col gap-2">
            {/* New Cut */}
            {can("createCut") && (
              <Button
                className="justify-start"
                variant="outline"
                onClick={() => router.push("/dashboard/cut-planner")}
              >
                <Scissors className="h-4 w-4" />
                New Cut
              </Button>
            )}

            {/* Add Roll — admin and manager only */}
            {can("manageRolls") && (
              <Button
                className="justify-start"
                variant="outline"
                onClick={() => router.push("/dashboard/inventory")}
              >
                <Plus className="h-4 w-4" />
                Add Roll
              </Button>
            )}

            {/* View Inventory — everyone */}
            {can("viewInventory") && (
              <Button
                className="justify-start"
                variant="outline"
                onClick={() => router.push("/dashboard/inventory")}
              >
                <Eye className="h-4 w-4" />
                View Inventory
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Recent Activity</h2>
        {loading ? (
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </CardContent>
          </Card>
        ) : recentActivity.length > 0 ? (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {activity.type === "cut" && <Scissors className="h-4 w-4 text-blue-500" />}
                      {activity.type === "roll_added" && (
                        <Plus className="h-4 w-4 text-green-500" />
                      )}
                      {activity.type === "roll_depleted" && (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm">No recent activity</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
