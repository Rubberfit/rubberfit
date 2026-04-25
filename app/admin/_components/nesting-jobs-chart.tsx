"use client"

import { useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

const DAY_DATA = [
  { label: "Mon", jobs: 24 },
  { label: "Tue", jobs: 38 },
  { label: "Wed", jobs: 31 },
  { label: "Thu", jobs: 45 },
  { label: "Fri", jobs: 52 },
  { label: "Sat", jobs: 18 },
  { label: "Sun", jobs: 9 },
]

const WEEK_DATA = [
  { label: "W1", jobs: 187 },
  { label: "W2", jobs: 214 },
  { label: "W3", jobs: 198 },
  { label: "W4", jobs: 241 },
  { label: "W5", jobs: 312 },
  { label: "W6", jobs: 278 },
  { label: "W7", jobs: 301 },
  { label: "W8", jobs: 267 },
]

export function NestingJobsChart() {
  const [view, setView] = useState<"day" | "week">("day")
  const data = view === "day" ? DAY_DATA : WEEK_DATA

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {view === "day" ? "Last 7 days" : "Last 8 weeks"}
        </span>
        <div className="flex items-center rounded-md overflow-hidden border border-zinc-700 text-xs">
          <button
            className={`px-2.5 py-1 transition-colors ${view === "day" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
            onClick={() => setView("day")}
          >
            Day
          </button>
          <button
            className={`px-2.5 py-1 transition-colors ${view === "week" ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
            onClick={() => setView("week")}
          >
            Week
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#a1a1aa", fontSize: 11 }}
            axisLine={{ stroke: "#3f3f46" }}
            tickLine={false}
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
            formatter={(value: number) => [value, "Nesting jobs"]}
            cursor={{ fill: "#27272a" }}
          />
          <Bar dataKey="jobs" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
