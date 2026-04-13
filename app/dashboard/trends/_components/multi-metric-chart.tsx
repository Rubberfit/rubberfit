"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts"
import { format } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { useState } from "react"

interface TrendData {
  date: string
  cuts: number
  materialUsed: number
  wastePercentage: number
  efficiency: number
  cost: number
}

interface MultiMetricChartProps {
  data: TrendData[]
  timeframe: string
}

type MetricType = "cuts" | "materialUsed" | "wastePercentage" | "efficiency" | "cost"

export function MultiMetricChart({ data, timeframe }: MultiMetricChartProps) {
  const [primaryMetric, setPrimaryMetric] = useState<MetricType>("cuts")
  const [secondaryMetric, setSecondaryMetric] = useState<MetricType>("wastePercentage")

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    if (timeframe === "12months") {
      return format(date, "MMM yyyy")
    } else if (timeframe === "12weeks") {
      return format(date, "MMM d")
    } else {
      return format(date, "MMM d")
    }
  }

  const getMetricLabel = (metric: MetricType) => {
    switch (metric) {
      case "cuts":
        return "Cuts"
      case "materialUsed":
        return "Material Used (sq ft)"
      case "wastePercentage":
        return "Waste (%)"
      case "efficiency":
        return "Efficiency (%)"
      case "cost":
        return "Cost ($)"
    }
  }

  const getMetricColor = (metric: MetricType) => {
    switch (metric) {
      case "cuts":
        return "#3b82f6"
      case "materialUsed":
        return "#22c55e"
      case "wastePercentage":
        return "#ef4444"
      case "efficiency":
        return "#f59e0b"
      case "cost":
        return "#8b5cf6"
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle>Performance Trends</CardTitle>
          <div className="flex gap-2">
            <Select
              value={primaryMetric}
              onValueChange={(value) => setPrimaryMetric(value as MetricType)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cuts">Cuts Volume</SelectItem>
                <SelectItem value="materialUsed">Material Used</SelectItem>
                <SelectItem value="wastePercentage">Waste Percentage</SelectItem>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="cost">Cost</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={secondaryMetric}
              onValueChange={(value) => setSecondaryMetric(value as MetricType)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cuts">Cuts Volume</SelectItem>
                <SelectItem value="materialUsed">Material Used</SelectItem>
                <SelectItem value="wastePercentage">Waste Percentage</SelectItem>
                <SelectItem value="efficiency">Efficiency</SelectItem>
                <SelectItem value="cost">Cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <XAxis dataKey="date" tickFormatter={formatDate} interval="preserveStartEnd" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as TrendData
                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-md">
                      <p className="font-medium">{formatDate(label as string)}</p>
                      <div className="space-y-1 mt-2">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cuts:</span>{" "}
                          <span className="font-medium">{data.cuts}</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Material Used:</span>{" "}
                          <span className="font-medium">{data.materialUsed.toFixed(1)} sq ft</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Waste:</span>{" "}
                          <span className="font-medium">{data.wastePercentage.toFixed(1)}%</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Efficiency:</span>{" "}
                          <span className="font-medium">{data.efficiency.toFixed(1)}%</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Cost:</span>{" "}
                          <span className="font-medium">${data.cost.toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={primaryMetric}
              stroke={getMetricColor(primaryMetric)}
              strokeWidth={2}
              dot={{ fill: getMetricColor(primaryMetric), strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
              name={getMetricLabel(primaryMetric)}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={secondaryMetric}
              stroke={getMetricColor(secondaryMetric)}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ fill: getMetricColor(secondaryMetric), strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
              name={getMetricLabel(secondaryMetric)}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
