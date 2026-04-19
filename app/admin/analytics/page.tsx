import { BarChart3, Building2, Clock, Layers, TrendingUp, Users } from "lucide-react"

import { FeatureAdoptionChart } from "../_components/feature-adoption-chart"
import { GrowthTrendChart } from "../_components/growth-trend-chart"
import { StatCard } from "../_components/stat-card"

const TOP_ORGS = [
  { name: "Apex Fabrics", members: 34, nestingJobs: "1,204", apiCalls: "142k", plan: "Enterprise", lastActive: "Today" },
  { name: "NexThread Co.", members: 18, nestingJobs: "887", apiCalls: "98k", plan: "Pro", lastActive: "Today" },
  { name: "Horizon Textiles", members: 12, nestingJobs: "541", apiCalls: "67k", plan: "Pro", lastActive: "Yesterday" },
  { name: "Stitch & Scale", members: 9, nestingJobs: "312", apiCalls: "44k", plan: "Starter", lastActive: "2 days ago" },
  { name: "Fabric Forward", members: 5, nestingJobs: "178", apiCalls: "21k", plan: "Starter", lastActive: "4 days ago" },
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
          <h1 className="text-xl font-bold text-zinc-100">Platform Analytics</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Aggregated usage metrics across all organizations.</p>
        </div>
        <select className="text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-600">
          <option>Last 7 days</option>
          <option>Last 30 days</option>
          <option>Last 90 days</option>
          <option>This year</option>
        </select>
      </div>

      {/* Platform-wide stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value="1,247" delta="+8.2%" deltaPositive icon={Users} />
        <StatCard label="Total Orgs" value="48" delta="+3 this week" deltaPositive icon={Building2} />
        <StatCard label="Total Nesting Jobs" value="14,832" delta="+12.4%" deltaPositive icon={Layers} />
        <StatCard label="Avg Session Duration" value="24m" delta="-2m vs last week" deltaPositive={false} icon={Clock} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">New Signups per Week</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Growth trend over the last 12 weeks</p>
          </div>
          <GrowthTrendChart />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Feature Adoption</h2>
            <p className="text-xs text-zinc-500 mt-0.5">% of orgs actively using each feature</p>
          </div>
          <FeatureAdoptionChart />
        </div>
      </div>

      {/* Secondary stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Monthly Active Users" value="1,204" delta="+8.2%" deltaPositive icon={Users} />
        <StatCard label="New Signups (7d)" value="87" delta="+14%" deltaPositive icon={TrendingUp} />
        <StatCard label="API Calls Today" value="284k" delta="+6k vs avg" deltaPositive icon={BarChart3} />
        <StatCard label="DAU / MAU Ratio" value="38%" delta="+3pts" deltaPositive icon={TrendingUp} />
      </div>

      {/* Top orgs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-200">Top Organizations by Usage</h2>
          <span className="text-xs text-zinc-500">Sorted by nesting jobs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Org Name</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Members</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Nesting Jobs</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">API Calls</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {TOP_ORGS.map((org) => (
                <tr key={org.name} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{org.name}</td>
                  <td className="px-4 py-3 text-white tabular-nums">{org.members}</td>
                  <td className="px-4 py-3 text-white tabular-nums font-mono text-xs">{org.nestingJobs}</td>
                  <td className="px-4 py-3 text-white tabular-nums font-mono text-xs">{org.apiCalls}</td>
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
