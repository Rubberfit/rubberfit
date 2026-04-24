const FEATURES = [
  { name: "Cut Planner", views: 3842 },
  { name: "Inventory", views: 2341 },
  { name: "Waste Analysis", views: 1980 },
  { name: "Reports", views: 1204 },
  { name: "Trends", views: 891 },
  { name: "Purchase Orders", views: 547 },
]

// Don't assume FEATURES is pre-sorted — compute the max so a future
// edit that appends or reorders entries still gives accurate bar widths.
const MAX = Math.max(...FEATURES.map((f) => f.views), 1)

export function FeaturePageViewsChart() {
  return (
    <div className="flex flex-col gap-2.5">
      {FEATURES.map((f) => {
        const pct = Math.round((f.views / MAX) * 100)
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-300">{f.name}</span>
              <span className="tabular-nums font-mono text-zinc-400">
                {f.views.toLocaleString()}
              </span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5">
              <div
                className="bg-violet-600 h-1.5 rounded-full"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
