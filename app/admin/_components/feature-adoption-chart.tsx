"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const DATA = [
  { feature: "Inventory", pct: 100 },
  { feature: "Cut Planner", pct: 94 },
  { feature: "Waste Analysis", pct: 82 },
  { feature: "Reports", pct: 76 },
  { feature: "2D Nesting", pct: 68 },
  { feature: "Trends", pct: 59 },
  { feature: "Purchase Orders", pct: 45 },
]

export function FeatureAdoptionChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        layout="vertical"
        data={DATA}
        margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={false}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="feature"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={96}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            color: "#f4f4f5",
            fontSize: "12px",
          }}
          formatter={(value: number) => [`${value}%`, "Orgs using"]}
          cursor={{ fill: "#27272a" }}
        />
        <Bar dataKey="pct" radius={[0, 3, 3, 0]} maxBarSize={18}>
          {DATA.map((entry) => (
            <Cell
              key={entry.feature}
              fill={entry.pct >= 80 ? "#7c3aed" : entry.pct >= 60 ? "#6d28d9" : "#4c1d95"}
            />
          ))}
          <LabelList
            dataKey="pct"
            position="right"
            formatter={(v: number) => `${v}%`}
            style={{ fill: "#a1a1aa", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
