import Link from "next/link"
import { AlertCircle, Building2, TrendingDown, TrendingUp } from "lucide-react"

import { StatCard } from "../_components/stat-card"

const ORGS = [
  {
    id: "org-001",
    name: "Apex Fabrics",
    plan: "Enterprise",
    members: 34,
    rollsUsed: 218,
    lastActive: "Today",
    daysSinceActive: 0,
    createdDate: "Jan 4, 2026",
    status: "Active" as const,
  },
  {
    id: "org-002",
    name: "NexThread Co.",
    plan: "Pro",
    members: 18,
    rollsUsed: 134,
    lastActive: "Today",
    daysSinceActive: 0,
    createdDate: "Feb 12, 2026",
    status: "Active" as const,
  },
  {
    id: "org-003",
    name: "Horizon Textiles",
    plan: "Pro",
    members: 12,
    rollsUsed: 89,
    lastActive: "Yesterday",
    daysSinceActive: 1,
    createdDate: "Nov 19, 2025",
    status: "Active" as const,
  },
  {
    id: "org-004",
    name: "Stitch & Scale",
    plan: "Starter",
    members: 9,
    rollsUsed: 44,
    lastActive: "2 days ago",
    daysSinceActive: 2,
    createdDate: "Mar 1, 2026",
    status: "Trial" as const,
  },
  {
    id: "org-005",
    name: "Fabric Forward",
    plan: "Starter",
    members: 5,
    rollsUsed: 21,
    lastActive: "4 days ago",
    daysSinceActive: 4,
    createdDate: "Mar 8, 2026",
    status: "Trial" as const,
  },
  {
    id: "org-006",
    name: "LoomTech Industries",
    plan: "Pro",
    members: 7,
    rollsUsed: 0,
    lastActive: "34 days ago",
    daysSinceActive: 34,
    createdDate: "Oct 3, 2025",
    status: "Suspended" as const,
  },
  {
    id: "org-007",
    name: "CutRight Labs",
    plan: "Starter",
    members: 3,
    rollsUsed: 8,
    lastActive: "41 days ago",
    daysSinceActive: 41,
    createdDate: "Dec 14, 2025",
    status: "Active" as const,
  },
  {
    id: "org-008",
    name: "ThreadWorks Co.",
    plan: "Pro",
    members: 11,
    rollsUsed: 67,
    lastActive: "62 days ago",
    daysSinceActive: 62,
    createdDate: "Sep 22, 2025",
    status: "Active" as const,
  },
]

const PLAN_STYLES: Record<string, string> = {
  Enterprise: "text-violet-400 bg-violet-900/40",
  Pro: "text-sky-400 bg-sky-900/40",
  Starter: "text-zinc-400 bg-zinc-800",
}

const STATUS_STYLES = {
  Active: "text-emerald-400 bg-emerald-900/40",
  Trial: "text-amber-400 bg-amber-900/40",
  Suspended: "text-red-400 bg-red-900/40",
} as const

export default function OrgsPage() {
  const inactiveCount = ORGS.filter((o) => o.daysSinceActive >= 30).length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Organizations</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Manage customer organizations, plans, and access.</p>
        </div>
        <input
          type="search"
          placeholder="Search organizations…"
          className="text-sm bg-zinc-800 border border-zinc-700 text-zinc-200 placeholder:text-zinc-500 rounded-md px-3 py-1.5 w-56 focus:outline-none focus:ring-1 focus:ring-violet-600"
        />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Orgs" value={String(ORGS.length)} icon={Building2} />
        <StatCard label="Active This Month" value="41" delta="+3" deltaPositive icon={TrendingUp} />
        <StatCard label="Inactive (30d+)" value={String(inactiveCount)} delta="no recent activity" deltaPositive={false} icon={AlertCircle} />
        <StatCard label="Churned This Month" value="2" delta="-1 vs last month" deltaPositive={false} icon={TrendingDown} />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        <button className="text-xs font-medium px-3 py-1.5 rounded-full bg-zinc-700 text-zinc-100 transition-colors">
          All
        </button>
        <button className="text-xs font-medium px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          Active
        </button>
        <button className="text-xs font-medium px-3 py-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
          Inactive
        </button>
      </div>

      {/* Orgs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Org Name</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Members</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Last Active</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Activity</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider" />
              </tr>
            </thead>
            <tbody>
              {ORGS.map((org) => {
                const isInactive = org.daysSinceActive >= 30
                return (
                  <tr key={org.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200">{org.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${PLAN_STYLES[org.plan] ?? ""}`}>
                        {org.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 tabular-nums">{org.members}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{org.createdDate}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{org.lastActive}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          isInactive ? "text-zinc-500 bg-zinc-800" : "text-emerald-400 bg-emerald-900/40"
                        }`}
                      >
                        {isInactive ? "Inactive" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[org.status]}`}>
                        {org.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/orgs/${org.id}`}
                        className="text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
