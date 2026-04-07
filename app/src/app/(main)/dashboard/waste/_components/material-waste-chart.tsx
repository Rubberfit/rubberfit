"use client"

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { type Cut } from "@/lib/supabase"

interface MaterialWasteChartProps {
  cuts: (Cut & { roll?: { material_type: string; cost_per_sqft?: number } })[]
}

interface MaterialWasteData {
  material: string
  averageWaste: number
  totalWaste: number
  wasteValue: number
  cuts: number
}

export function MaterialWasteChart({ cuts }: MaterialWasteChartProps) {
  // Group cuts by material type and calculate waste metrics
  const materialData = cuts.reduce(
    (acc, cut) => {
      const material = cut.roll?.material_type || "Unknown"
      if (!acc[material]) {
        acc[material] = {
          cuts: [],
          totalWaste: 0,
          totalWasteValue: 0,
        }
      }
      acc[material].cuts.push(cut)
      acc[material].totalWaste += cut.waste_sqft || 0
      acc[material].totalWasteValue += (cut.waste_sqft || 0) * (cut.roll?.cost_per_sqft || 2.5)
      return acc
    },
    {} as Record<string, { cuts: typeof cuts; totalWaste: number; totalWasteValue: number }>
  )

  const chartData: MaterialWasteData[] = Object.entries(materialData)
    .map(([material, data]) => ({
      material,
      averageWaste:
        data.cuts.filter((cut) => cut.waste_percentage !== null).length > 0
          ? data.cuts
              .filter((cut) => cut.waste_percentage !== null)
              .reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) /
            data.cuts.filter((cut) => cut.waste_percentage !== null).length
          : 0,
      totalWaste: data.totalWaste,
      wasteValue: data.totalWasteValue,
      cuts: data.cuts.length,
    }))
    .sort((a, b) => b.averageWaste - a.averageWaste)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Waste by Material Type</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ left: 20, right: 20, top: 20, bottom: 5 }}>
            <XAxis dataKey="material" angle={-45} textAnchor="end" height={80} fontSize={12} />
            <YAxis label={{ value: "Avg Waste %", angle: -90, position: "insideLeft" }} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as MaterialWasteData
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-md">
                      <p className="font-medium">{label}</p>
                      <div className="space-y-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Avg Waste:</span>{" "}
                          <span className="font-medium">{data.averageWaste.toFixed(1)}%</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Total Waste:</span>{" "}
                          <span className="font-medium">{data.totalWaste.toFixed(1)} sq ft</span>
                        </p>
                        <p className="text-sm">
                          <span className="text-muted-foreground">Waste Value:</span>{" "}
                          <span className="font-medium">${data.wasteValue.toFixed(0)}</span>
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
            <Bar dataKey="averageWaste" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
