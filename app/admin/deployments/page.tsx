const FILTER_PILLS = ["All", "In Progress", "Success", "Failed"] as const

const DEPLOYMENTS = [
  {
    id: "d-0197",
    branch: "main",
    env: "Production",
    triggeredBy: "qyamas45",
    started: "10:22 AM",
    duration: "3m 14s",
    status: "Success" as const,
  },
  {
    id: "d-0196",
    branch: "feat/org-detail-ui",
    env: "Staging",
    triggeredBy: "CI / GitHub Actions",
    started: "09:48 AM",
    duration: "2m 58s",
    status: "In Progress" as const,
  },
  {
    id: "d-0195",
    branch: "fix/queue-worker-lag",
    env: "Staging",
    triggeredBy: "qyamas45",
    started: "09:14 AM",
    duration: "4m 02s",
    status: "Failed" as const,
  },
  {
    id: "d-0194",
    branch: "main",
    env: "Production",
    triggeredBy: "CI / GitHub Actions",
    started: "Yesterday 11:01 PM",
    duration: "3m 22s",
    status: "Success" as const,
  },
  {
    id: "d-0193",
    branch: "chore/deps-update",
    env: "Staging",
    triggeredBy: "qyamas45",
    started: "Yesterday 4:30 PM",
    duration: "2m 47s",
    status: "Success" as const,
  },
]

const STATUS_STYLES = {
  Success: "text-emerald-400 bg-emerald-900/40",
  "In Progress": "text-sky-400 bg-sky-900/40",
  Failed: "text-red-400 bg-red-900/40",
} as const

const ENV_STYLES: Record<string, string> = {
  Production: "text-emerald-300 bg-emerald-900/30",
  Staging: "text-sky-300 bg-sky-900/30",
}

const LOG_LINES = [
  "▶ [10:22:01] Deploying d-0197 to production...",
  "  [10:22:03] Pulling image: rema-portal:v2.14.1",
  "  [10:22:08] Running migrations... OK (4 applied)",
  "  [10:22:11] Starting app containers (2/2)...",
  "  [10:22:19] Health check passed: /api/health → 200",
  "  [10:22:20] Old containers drained and removed",
  "✔ [10:25:15] Deployment d-0197 completed successfully",
  "",
  "▶ [09:48:12] Deploying d-0196 to staging...",
  "  [09:48:14] Pulling image: rema-portal:feat-org-detail-ui",
  "  [09:48:21] Running migrations... OK (0 applied)",
  "  [09:48:25] Starting app containers (1/1)...",
]

export default function DeploymentsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Deployment Management</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Pipeline runs, release history, and live logs.</p>
        </div>
        <button className="text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white px-4 py-1.5 rounded-md transition-colors">
          + New Deployment
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2">
        {FILTER_PILLS.map((pill, i) => (
          <button
            key={pill}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              i === 0
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            }`}
          >
            {pill}
          </button>
        ))}
      </div>

      {/* Deployments table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">ID</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Branch</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Environment</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Triggered By</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Started</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-2.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {DEPLOYMENTS.map((d) => (
                <tr key={d.id} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-violet-400">{d.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300 max-w-[180px] truncate">{d.branch}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ENV_STYLES[d.env] ?? ""}`}>
                      {d.env}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{d.triggeredBy}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">{d.started}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-400">{d.duration}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_STYLES[d.status]}`}>
                      {d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log viewer */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-400 font-mono">DEPLOYMENT LOG — d-0197</span>
          <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-900/40 px-1.5 py-0.5 rounded">LIVE</span>
        </div>
        <div className="p-4 h-48 overflow-auto font-mono text-xs text-emerald-400 leading-relaxed">
          {LOG_LINES.map((line, i) => (
            <div key={i} className={line === "" ? "h-2" : ""}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
