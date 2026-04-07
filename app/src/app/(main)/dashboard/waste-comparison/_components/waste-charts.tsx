"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts"

interface WasteChartsProps {
  trendData: { date: string; avgWaste: number; totalWaste: number; cuts: number }[]
  materialComparison: { material: string; currentWaste: number; previousWaste: number }[]
}

export function WasteCharts({ trendData, materialComparison }: WasteChartsProps) {
  return (
    <>
      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Waste Trend</CardTitle>
          <CardDescription>Average waste percentage by day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="avgWaste"
                  stroke="#2563EB"
                  fill="#2563EB"
                  fillOpacity={0.2}
                  name="Avg Waste %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Material Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Material Type Comparison</CardTitle>
          <CardDescription>Waste performance by material type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={materialComparison}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="material" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="previousWaste" fill="#94A3B8" name="Previous Period" />
                <Bar dataKey="currentWaste" fill="#2563EB" name="Current Period" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
