"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

interface UsageData {
  period: string
  totalUsage: number
  cuts: number
}

interface UsageTrendChartProps {
  data: UsageData[]
}

export function UsageTrendChart({ data }: UsageTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Usage Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as UsageData
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md">
                      <p className="font-medium">{label}</p>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Material Used:</span>{" "}
                          <span className="font-medium">{data.totalUsage.toFixed(1)} sq ft</span>
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
            <Line
              type="monotone"
              dataKey="totalUsage"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
