"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface MaterialUsage {
  materialType: string
  totalSqftUsed: number
  totalCuts: number
  averageUtilization: number
  totalValue: number
  rollsUsed: number
}

interface MaterialDistributionChartProps {
  data: MaterialUsage[]
}

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#ef4444",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#10b981",
  "#f97316",
  "#6366f1",
]

export function MaterialDistributionChart({ data }: MaterialDistributionChartProps) {
  const chartData = data.map((item, index) => ({
    ...item,
    color: COLORS[index % COLORS.length],
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Usage Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center">
          <ResponsiveContainer width="60%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="totalSqftUsed"
                label={false}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload as MaterialUsage & { color: string }
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-md">
                        <p className="font-medium">{data.materialType}</p>
                        <div className="space-y-1">
                          <p className="text-sm">
                            <span className="text-muted-foreground">Used:</span>{" "}
                            <span className="font-medium">
                              {data.totalSqftUsed.toFixed(1)} sq ft
                            </span>
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Value:</span>{" "}
                            <span className="font-medium">${data.totalValue.toFixed(0)}</span>
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Cuts:</span>{" "}
                            <span className="font-medium">{data.totalCuts}</span>
                          </p>
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex-1 space-y-2 pl-4">
            {chartData.map((item, _index) => (
              <div key={item.materialType} className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-sm font-medium">{item.materialType}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {item.totalSqftUsed.toFixed(1)} sq ft
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
