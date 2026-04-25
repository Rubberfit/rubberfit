"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const DATA = [
  { week: "Jan 1", signups: 12 },
  { week: "Jan 8", signups: 18 },
  { week: "Jan 15", signups: 14 },
  { week: "Jan 22", signups: 22 },
  { week: "Jan 29", signups: 19 },
  { week: "Feb 5", signups: 27 },
  { week: "Feb 12", signups: 31 },
  { week: "Feb 19", signups: 24 },
  { week: "Feb 26", signups: 38 },
  { week: "Mar 5", signups: 42 },
  { week: "Mar 12", signups: 35 },
  { week: "Mar 19", signups: 47 },
]

export function GrowthTrendChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={DATA} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          axisLine={{ stroke: "#3f3f46" }}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: "#a1a1aa", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            color: "#f4f4f5",
            fontSize: "12px",
          }}
          formatter={(value: number) => [value, "New Signups"]}
        />
        <Area
          type="monotone"
          dataKey="signups"
          stroke="#7c3aed"
          strokeWidth={2}
          fill="url(#signupGradient)"
          dot={false}
          activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
