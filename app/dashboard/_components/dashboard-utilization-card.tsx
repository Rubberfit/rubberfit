"use client"

import { useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Card } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

/**
 * Utilization by material — stacked bar chart matching the
 * Operations Overview mock. Columns are days of the week (Mon
 * → Sun); bars are stacked by material type. Period toggle
 * (7d / 30d / 90d) is local state; the parent page is
 * responsible for passing pre-aggregated data.
 *
 * If no data yet, falls back to an empty-state card instead
 * of a bare chart. Colors come from chart-1..8 tokens (Task 1).
 */

export interface UtilizationDatum {
  label: string
  [material: string]: number | string
}

export interface UtilizationCardProps {
  data: ReadonlyArray<UtilizationDatum>
  /** Ordered material names matching keys in each datum. */
  materials: ReadonlyArray<string>
  period?: "7d" | "30d" | "90d"
  onPeriodChange?: (period: "7d" | "30d" | "90d") => void
  className?: string
}

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
]

const PERIODS: Array<"7d" | "30d" | "90d"> = ["7d", "30d", "90d"]

export function UtilizationCard({
  data,
  materials,
  period: controlledPeriod,
  onPeriodChange,
  className,
}: UtilizationCardProps) {
  const [localPeriod, setLocalPeriod] = useState<"7d" | "30d" | "90d">("7d")
  const period = controlledPeriod ?? localPeriod
  // The toggle is only a true affordance when the parent wires
  // `onPeriodChange` so the underlying data can be refetched for the
  // new window. Without that callback, flipping periods would just
  // re-colour the highlight without changing the chart — disable the
  // toggle entirely so users don't think it's broken.
  const isToggleEnabled = typeof onPeriodChange === "function"

  const handlePeriodChange = (next: "7d" | "30d" | "90d") => {
    if (!isToggleEnabled) return
    setLocalPeriod(next)
    onPeriodChange(next)
  }

  const colorLookup = useMemo(() => {
    const map: Record<string, string> = {}
    materials.forEach((m, i) => {
      map[m] = PALETTE[i % PALETTE.length]
    })
    return map
  }, [materials])

  return (
    <Card className={cn("flex flex-col gap-3 p-4", className)}>
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Utilization by material</h3>
        <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={!isToggleEnabled}
              aria-pressed={period === p}
              onClick={() => handlePeriodChange(p)}
              className={cn(
                "rounded px-2 py-1 font-medium transition-colors",
                period === p
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                !isToggleEnabled && "cursor-not-allowed opacity-60"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </header>
      {data.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-muted-foreground text-sm">
          No cut activity in the selected window.
        </div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...data]} margin={{ top: 8, right: 4, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                cursor={{ fill: "var(--hover-overlay)" }}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
              {materials.map((material) => (
                <Bar
                  key={material}
                  dataKey={material}
                  stackId="material"
                  fill={colorLookup[material]}
                  isAnimationActive={false}
                  radius={[2, 2, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
