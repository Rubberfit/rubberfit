"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MaterialData {
  name: string;
  sqft: number;
  rolls: number;
}

interface MaterialSummaryChartProps {
  data: MaterialData[];
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
];

export function MaterialSummaryChart({ data }: MaterialSummaryChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Inventory Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={100}
              interval={0}
            />
            <YAxis />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'sqft') {
                  return [`${value.toFixed(1)} sqft`, 'Square Footage'];
                }
                return [value, name];
              }}
            />
            <Bar dataKey="sqft" name="Square Footage">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-muted-foreground">
                {item.name}: {item.rolls} rolls
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}