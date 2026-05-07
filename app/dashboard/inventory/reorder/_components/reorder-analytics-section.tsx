"use client"

import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Progress } from "@/app/components/ui/progress"
import { cn } from "@/app/lib/utils"

interface AnalyticsSectionProps {
  reorderRules: ReorderRuleWithDetails[]
}

/**
 * Performance + Cost optimization tiles surface placeholder values
 * (94/88/76, $2,450, $340, $580) carried over from the pre-restyle
 * page; real metric wiring is tracked in the dashboard refactor
 * roadmap, Phase 4. Stockout-risk uses live `reorderRules`.
 */
export function AnalyticsSection({ reorderRules }: AnalyticsSectionProps) {
  return (
    <section id="analytics" className="scroll-mt-24 space-y-4">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
        Analytics
      </h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Reorder performance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Track reorder efficiency and optimization
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <PerformanceRow label="Stock availability" value={94} />
            <PerformanceRow label="Order accuracy" value={88} />
            <PerformanceRow label="Lead time compliance" value={76} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost optimization</CardTitle>
            <p className="text-sm text-muted-foreground">Savings from EOQ and bulk ordering</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <CostRow label="Monthly ordering cost" value="$2,450" />
            <CostRow label="EOQ savings" value="$340" tone="success" />
            <CostRow label="Bulk order discount" value="$580" tone="success" />
            <div className="border-t pt-3">
              <CostRow label="Total monthly savings" value="$920" tone="success" emphasis />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stockout risk analysis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Materials at risk of stockout in the next 30 days
          </p>
        </CardHeader>
        <CardContent>
          {reorderRules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reorder rules configured yet.</p>
          ) : (
            <div className="space-y-4">
              {reorderRules.slice(0, 5).map((rule) => {
                const currentStock = rule.current_stock ?? 0
                const reorderPoint = rule.reorder_point ?? 0
                const risk =
                  reorderPoint > 0
                    ? Math.max(
                        0,
                        Math.min(100, ((reorderPoint - currentStock) / reorderPoint) * 100 + 50)
                      )
                    : 0
                const tone: "danger" | "warning" | "success" =
                  risk > 70 ? "danger" : risk > 40 ? "warning" : "success"
                return (
                  <div key={rule.id}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-sm">{rule.material_type?.name ?? "Unknown"}</span>
                      <span
                        className={cn(
                          "font-mono text-sm font-medium",
                          tone === "danger" && "text-[color:var(--danger)]",
                          tone === "warning" && "text-[color:var(--warning)]",
                          tone === "success" && "text-[color:var(--success)]"
                        )}
                      >
                        {risk.toFixed(0)}% risk
                      </span>
                    </div>
                    <Progress
                      value={risk}
                      className={cn(
                        "h-2",
                        tone === "danger" && "[&>div]:bg-[color:var(--danger)]",
                        tone === "warning" && "[&>div]:bg-[color:var(--warning)]"
                      )}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function PerformanceRow({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-mono text-sm font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  )
}

interface CostRowProps {
  label: string
  value: string
  tone?: "default" | "success"
  emphasis?: boolean
}

function CostRow({ label, value, tone = "default", emphasis = false }: CostRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "text-sm",
          emphasis ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-sm",
          emphasis ? "font-semibold" : "font-medium",
          tone === "success" && "text-[color:var(--success)]"
        )}
      >
        {value}
      </span>
    </div>
  )
}
