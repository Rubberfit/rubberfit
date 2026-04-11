"use client"

import { AlertTriangle, ShoppingCart, Truck, Activity } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ReorderRuleWithDetails } from "@/lib/supabase"
import type { ReorderSuggestion } from "./reorder-suggestions"

interface ReorderStatsCardsProps {
  reorderRules: ReorderRuleWithDetails[]
  suggestions: ReorderSuggestion[]
}

export function ReorderStatsCards({ reorderRules, suggestions }: ReorderStatsCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Rules</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{reorderRules.filter((r) => r.active).length}</div>
          <p className="text-xs text-muted-foreground">
            {reorderRules.filter((r) => r.auto_reorder).length} auto-enabled
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Reorder Needed</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{suggestions.length}</div>
          <p className="text-xs text-muted-foreground">
            {suggestions.filter((s) => s.urgencyLevel === "critical").length} critical
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Est. Order Value</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            $
            {suggestions
              .reduce((sum, s) => sum + s.estimatedCost, 0)
              .toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
          <p className="text-xs text-muted-foreground">For {suggestions.length} items</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
          <Truck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {reorderRules.length > 0
              ? Math.round(
                  reorderRules.reduce((sum, r) => sum + r.lead_time_days, 0) / reorderRules.length
                )
              : 0}{" "}
            days
          </div>
          <p className="text-xs text-muted-foreground">Across all materials</p>
        </CardContent>
      </Card>
    </div>
  )
}
