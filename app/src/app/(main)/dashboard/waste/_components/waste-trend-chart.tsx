"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WasteAnalysis {
  period: string;
  totalWaste: number;
  wasteValue: number;
  averageWaste: number;
  cuts: number;
}

interface WasteTrendChartProps {
  data: WasteAnalysis[];
}

export function WasteTrendChart({ data }: WasteTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waste Trend Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as WasteAnalysis;
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
                  );
                }
                return null;
              }}
            />
            <Line
              type="monotone"
              dataKey="averageWaste"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ fill: "#ef4444", strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}