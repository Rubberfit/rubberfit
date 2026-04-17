import { BarChart3, Clock, TrendingUp, Users } from "lucide-react"

import { StatCard } from "../_components/stat-card"

const TOP_ORGS = [
  { name: "Apex Fabrics", users: 34, apiCalls: "142k", plan: "Enterprise", lastActive: "Today" },
  { name: "NexThread Co.", users: 18, apiCalls: "98k", plan: "Pro", lastActive: "Today" },
  { name: "Horizon Textiles", users: 12, apiCalls: "67k", plan: "Pro", lastActive: "Yesterday" },
  { name: "Stitch & Scale", users: 9, apiCalls: "44k", plan: "Starter", lastActive: "2 days ago" },
  { name: "Fabric Forward", users: 5, apiCalls: "21k", plan: "Starter", lastActive: "4 days ago" },
]

const PLAN_STYLES: Record<string, string> = {
  Enterprise: "text-violet-400 bg-violet-900/40",
  Pro: "text-sky-400 bg-sky-900/40",
  Starter: "text-zinc-400 bg-zinc-800",
}

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Customer Usage Analytics</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Aggregated usage metrics across all organizations.</p>
        </div>
        <select className="text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-600">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
          <option>This year</option>
        </select>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Monthly Active Users" value="1,204" delta="+8.2%" deltaPositive icon={Users} />
        <StatCard label="New Signups (7d)" value="87" delta="+14%" deltaPositive icon={TrendingUp} />
        <StatCard label="API Calls Today" value="284k" delta="+6k vs avg" deltaPositive icon={BarChart3} />
        <StatCard label="Avg Session Duration" value="24m" delta="-2m" deltaPositive={false} icon={Clock} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">User Growth</h2>
          <div className="h-48 bg-zinc-800 rounded flex flex-col items-center justify-center gap-2 text-zinc-500">
            <TrendingUp className="w-8 h-8 opacity-30" />
            <span className="text-xs italic">Line chart — user growth over selected period</span>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">Feature Usage</h2>
          <div className="h-48 bg-zinc-800 rounded flex flex-col items-center justify-center gap-2 text-zinc-500">
            <BarChart3 className="w-8 h-8 opacity-30" />
            <span className="text-xs italic">Bar chart — Cut Planner, Inventory, Reports, etc.</span>
          </div>
        </div>
      </div>

      {/* Top orgs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Top Organizations by Usage</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Org Name</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Users</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">API Calls</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {TOP_ORGS.map((org) => (
                <tr key={org.name} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-zinc-200 font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums">{org.users}</td>
                  <td className="px-4 py-3 text-zinc-400 tabular-nums font-mono text-xs">{org.apiCalls}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PLAN_STYLES[org.plan] ?? ""}`}>
                      {org.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{org.lastActive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
