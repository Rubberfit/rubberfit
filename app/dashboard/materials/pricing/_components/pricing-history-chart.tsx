"use client"

import { Calendar } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

import { type Supplier } from "@/app/lib/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"

interface PricingHistoryChartProps {
  selectedMaterial: string
  chartData: Record<string, unknown>[]
  suppliers: Supplier[]
  filteredPriceHistoryLength: number
}

export function PricingHistoryChart({
  selectedMaterial,
  chartData,
  suppliers,
  filteredPriceHistoryLength,
}: PricingHistoryChartProps) {
  if (selectedMaterial !== "all" && chartData.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price Trends</CardTitle>
          <CardDescription>
            Historical price data for selected material across suppliers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip
                formatter={(value: string | number) => `$${Number(value).toFixed(2)}/sq ft`}
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid #e5e7eb",
                  borderRadius: "6px",
                }}
              />
              <Legend />
              {suppliers.map((supplier, index) => (
                <Line
                  key={supplier.id}
                  type="monotone"
                  dataKey={supplier.name}
                  stroke={`hsl(${(index * 360) / suppliers.length}, 70%, 50%)`}
                  strokeWidth={2}
                  dot={{ fill: `hsl(${(index * 360) / suppliers.length}, 70%, 50%)`, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    )
  }

  if (selectedMaterial === "all" && filteredPriceHistoryLength === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Select a specific material to view price history
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
