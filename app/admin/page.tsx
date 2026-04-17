import { Activity, AlertCircle, Building2, Rocket, Users } from "lucide-react"

import { StatCard } from "./_components/stat-card"
import { SiteHealthSection } from "./_components/site-health-section"

const RECENT_ACTIVITY = [
  { id: 1, color: "bg-emerald-400", text: "Org Apex Fabrics created", time: "2m ago" },
  { id: 2, color: "bg-sky-400", text: "Deploy #d-0192 completed on production", time: "14m ago" },
  { id: 3, color: "bg-amber-400", text: "High memory usage on API-02 node", time: "31m ago" },
  { id: 4, color: "bg-violet-400", text: "New user batch imported — NexThread (12 users)", time: "1h ago" },
  { id: 5, color: "bg-zinc-500", text: "Scheduled maintenance window completed", time: "3h ago" },
]

const SYSTEM_SERVICES = [
  { name: "API Gateway", status: "Operational", color: "text-emerald-400 bg-emerald-900/40" },
  { name: "Database (Primary)", status: "Operational", color: "text-emerald-400 bg-emerald-900/40" },
  { name: "Job Queue", status: "Degraded", color: "text-amber-400 bg-amber-900/40" },
  { name: "File Storage", status: "Operational", color: "text-emerald-400 bg-emerald-900/40" },
  { name: "Email Service", status: "Operational", color: "text-emerald-400 bg-emerald-900/40" },
  { name: "Auth Service", status: "Operational", color: "text-emerald-400 bg-emerald-900/40" },
]

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Internal Ops Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Platform-wide health, usage, and deployment status.</p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orgs" value="48" delta="+3 this week" deltaPositive icon={Building2} />
        <StatCard label="Active Users" value="1,204" delta="+12%" deltaPositive icon={Users} />
        <StatCard label="Deployments Today" value="7" delta="-2 vs yesterday" deltaPositive={false} icon={Rocket} />
        <StatCard label="Incidents Open" value="2" delta="1 critical" deltaPositive={false} icon={AlertCircle} />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-400" />
              Recent Activity
            </h2>
            <span className="text-xs text-zinc-500">Live</span>
          </div>
          <ul className="flex flex-col gap-3">
            {RECENT_ACTIVITY.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${item.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-300 leading-snug">{item.text}</p>
                </div>
                <span className="text-xs text-zinc-500 shrink-0">{item.time}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* System Status */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">System Status</h2>
          <ul className="flex flex-col gap-2">
            {SYSTEM_SERVICES.map((svc) => (
              <li key={svc.name} className="flex items-center justify-between py-1 border-b border-zinc-800/60 last:border-0">
                <span className="text-sm text-zinc-300">{svc.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${svc.color}`}>
                  {svc.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Site Health */}
      <SiteHealthSection />
    </div>
  )
}
