import Link from "next/link"
import { ArrowLeft, BarChart3, Package, Server, Users } from "lucide-react"

import { StatCard } from "../../_components/stat-card"

const USERS = [
  { name: "Jordan Mercer", role: "Admin", lastLogin: "Today, 09:41 AM", status: "Active" },
  { name: "Priya Nair", role: "Manager", lastLogin: "Today, 08:15 AM", status: "Active" },
  { name: "Sam Delacroix", role: "Cutter", lastLogin: "Yesterday, 3:22 PM", status: "Active" },
  { name: "Alex Thornton", role: "Member", lastLogin: "3 days ago", status: "Active" },
  { name: "Riley Chen", role: "Viewer", lastLogin: "12 days ago", status: "Inactive" },
]

const AUDIT_LOG = [
  { actor: "Jordan Mercer", action: "Uploaded 6 new rolls to inventory", time: "Today, 10:02 AM" },
  { actor: "Priya Nair", action: "Approved cut plan #CP-0341", time: "Today, 09:55 AM" },
  { actor: "Sam Delacroix", action: "Completed batch cut job #BC-0118", time: "Yesterday, 4:30 PM" },
  { actor: "Jordan Mercer", action: "Invited Riley Chen as Viewer", time: "Yesterday, 11:14 AM" },
  { actor: "System", action: "Low stock alert triggered for Material #MAT-007", time: "2 days ago, 2:00 AM" },
]

const USER_STATUS_STYLES: Record<string, string> = {
  Active: "text-emerald-400 bg-emerald-900/40",
  Inactive: "text-zinc-500 bg-zinc-800",
}

const FEATURE_FLAGS = [
  { label: "Batch Cut Planner", enabled: true },
  { label: "PDF Export", enabled: true },
  { label: "Supplier Portal", enabled: false },
  { label: "Advanced Analytics", enabled: false },
]

export default function OrgDetailPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <Link
          href="/admin/orgs"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Organizations
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-100">Apex Fabrics</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded text-violet-400 bg-violet-900/40">Enterprise</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded text-emerald-400 bg-emerald-900/40">Active</span>
        </div>
        <p className="text-sm text-zinc-400 mt-1">org-001 · Created Jan 4, 2026</p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Users" value="34" icon={Users} />
        <StatCard label="Active Rolls" value="218" icon={Package} />
        <StatCard label="API Calls (30d)" value="142k" delta="+18%" deltaPositive icon={BarChart3} />
        <StatCard label="Storage Used" value="4.2 GB" delta="of 20 GB" icon={Server} />
      </div>

      {/* Users + Config grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Users table (span 2) */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-200">Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Last Login</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {USERS.map((u) => (
                  <tr key={u.name} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-zinc-200">{u.name}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{u.role}</td>
                    <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">{u.lastLogin}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${USER_STATUS_STYLES[u.status] ?? ""}`}>
                        {u.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Config panel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-zinc-200">Configuration</h2>
          <div className="flex flex-col gap-3">
            {[
              ["Plan", "Enterprise"],
              ["Max Users", "50"],
              ["Max Rolls", "Unlimited"],
              ["Data Retention", "24 months"],
            ].map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-sm border-b border-zinc-800/60 pb-3 last:border-0 last:pb-0">
                <span className="text-zinc-400">{key}</span>
                <span className="text-zinc-200 font-medium">{val}</span>
              </div>
            ))}
          </div>

          {/* Feature flags */}
          <div className="pt-1 border-t border-zinc-800">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Feature Flags</p>
            <div className="flex flex-col gap-2">
              {FEATURE_FLAGS.map((flag) => (
                <div key={flag.label} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">{flag.label}</span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      flag.enabled
                        ? "text-emerald-400 bg-emerald-900/40"
                        : "text-zinc-500 bg-zinc-800"
                    }`}
                  >
                    {flag.enabled ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Usage timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-zinc-200">Roll Consumption — Last 30 Days</h2>
        <div className="h-32 bg-zinc-800 rounded flex items-center justify-center text-zinc-500">
          <span className="text-xs italic">Area chart — daily roll consumption over 30 days</span>
        </div>
      </div>

      {/* Audit log */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Audit Log</h2>
        </div>
        <ul className="divide-y divide-zinc-800/60">
          {AUDIT_LOG.map((entry, i) => (
            <li key={i} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-zinc-800/30 transition-colors">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-zinc-300">{entry.actor}</span>
                <span className="text-xs text-zinc-500 mx-1">·</span>
                <span className="text-xs text-zinc-400">{entry.action}</span>
              </div>
              <span className="text-[10px] text-zinc-500 whitespace-nowrap shrink-0">{entry.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
