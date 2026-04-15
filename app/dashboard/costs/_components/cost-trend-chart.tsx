"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

interface MonthlyCosts {
  period: string
  cutCost: number
  reusableCost: number
  wasteCost: number
  totalCost: number
  cuts: number
}

interface CostTrendChartProps {
  data: MonthlyCosts[]
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Trend Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as MonthlyCosts
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md">
                      <p className="font-medium">{label}</p>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Total Cost:</span>{" "}
                          <span className="font-medium">${data.totalCost.toFixed(2)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cut Value:</span>{" "}
                          <span className="font-medium">${data.cutCost.toFixed(2)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Reusable:</span>{" "}
                          <span className="font-medium">${data.reusableCost.toFixed(2)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Waste:</span>{" "}
                          <span className="font-medium">${data.wasteCost.toFixed(2)}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cuts:</span>{" "}
                          <span className="font-medium">{data.cuts}</span>
                        </p>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Area
              type="monotone"
              dataKey="cutCost"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="reusableCost"
              stackId="1"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="wasteCost"
              stackId="1"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.8}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="mt-4 flex justify-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#3b82f6" }} />
            <span className="text-sm">Cut Value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-sm">Reusable Value</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#ef4444" }} />
            <span className="text-sm">Waste Cost</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
