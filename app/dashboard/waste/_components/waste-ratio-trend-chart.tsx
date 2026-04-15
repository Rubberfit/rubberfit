"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/app/components/ui/card"

export interface TrendPoint {
  period: string
  wasteRatio: number   // (1 − avg_fab_score) × 100
  scrapRatio: number   // scrap_sqft / total_sqft × 100
  cuts: number
  totalScrap: number   // ft²
  totalMaterial: number // ft²
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ payload: TrendPoint }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>
          Waste ratio:{" "}
          <span className="font-medium text-foreground">{d.wasteRatio.toFixed(1)}%</span>
        </p>
        <p>
          Pure scrap:{" "}
          <span className="font-medium text-foreground">{d.scrapRatio.toFixed(1)}%</span>
        </p>
        <p>
          Cuts:{" "}
          <span className="font-medium text-foreground">{d.cuts}</span>
        </p>
        <p>
          Scrap:{" "}
          <span className="font-medium text-foreground">{d.totalScrap.toFixed(1)} ft²</span>
        </p>
        <p>
          Material used:{" "}
          <span className="font-medium text-foreground">{d.totalMaterial.toFixed(1)} ft²</span>
        </p>
      </div>
    </div>
  )
}

interface WasteRatioTrendChartProps {
  data: TrendPoint[]
  isLoading: boolean
}

export function WasteRatioTrendChart({ data, isLoading }: WasteRatioTrendChartProps) {
  const isEmpty = !isLoading && data.length === 0
  const isSinglePoint = data.length === 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waste Ratio Trend</CardTitle>
        <CardDescription>
          Average waste % per period — dashed line marks the 20% alert threshold
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : isEmpty ? (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No cut records in the selected period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart
              data={data}
              margin={{ top: 4, right: isSinglePoint ? 40 : 4, bottom: 0, left: isSinglePoint ? 40 : 0 }}
            >
              <defs>
                <linearGradient id="wasteGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="scrapGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                padding={isSinglePoint ? { left: 60, right: 60 } : undefined}
              />
              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 11 }}
                domain={[0, "auto"]}
                className="fill-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={20}
                stroke="#ef4444"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="wasteRatio"
                name="Waste ratio"
                stroke="#ef4444"
                strokeWidth={2}
                fill="url(#wasteGrad)"
                dot={{ fill: "#ef4444", r: isSinglePoint ? 5 : 3, strokeWidth: 0 }}
                activeDot={{ r: isSinglePoint ? 7 : 5 }}
              />
              <Area
                type="monotone"
                dataKey="scrapRatio"
                name="Pure scrap %"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#scrapGrad)"
                dot={{ fill: "#f59e0b", r: isSinglePoint ? 5 : 3, strokeWidth: 0 }}
                activeDot={{ r: isSinglePoint ? 7 : 5 }}
                strokeDasharray="4 2"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
