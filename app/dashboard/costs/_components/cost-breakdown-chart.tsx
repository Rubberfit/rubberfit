"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

interface MaterialCost {
  materialType: string
  totalCost: number
  cutCost: number
  reusableCost: number
  wasteCost: number
  cuts: number
  avgCostPerCut: number
}

interface CostBreakdownChartProps {
  data: MaterialCost[]
}

export function CostBreakdownChart({ data }: CostBreakdownChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Material Type</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ left: 20, right: 20, top: 20, bottom: 40 }}>
            <XAxis dataKey="materialType" angle={-45} textAnchor="end" height={80} fontSize={12} />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as MaterialCost
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
                          <span className="text-muted-foreground">Avg/Cut:</span>{" "}
                          <span className="font-medium">${data.avgCostPerCut.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Bar dataKey="cutCost" stackId="cost" fill="#3b82f6" />
            <Bar dataKey="reusableCost" stackId="cost" fill="#22c55e" />
            <Bar dataKey="wasteCost" stackId="cost" fill="#ef4444" />
          </BarChart>
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
