type EndpointStatus = "operational" | "degraded" | "down" | "unknown"

interface SparklineProps {
  status: EndpointStatus
  avgResponseMs: number | null
  height?: number
  data?: number[]
}

const SPARKLINE_COLORS: Record<EndpointStatus, { stroke: string; fill: string }> = {
  operational: { stroke: "#34d399", fill: "rgba(52,211,153,0.08)" },
  degraded:    { stroke: "#fbbf24", fill: "rgba(251,191,36,0.08)" },
  down:        { stroke: "#f87171", fill: "rgba(248,113,113,0.08)" },
  unknown:     { stroke: "#52525b", fill: "rgba(82,82,91,0.08)" },
}

export function Sparkline({ status, height = 40, data }: SparklineProps) {
  const W = 240
  const H = height

  const pts =
    data && data.length > 0
      ? (() => {
          const maxVal = Math.max(...data, 1)
          return data.map(v => {
            const normalized = (v / maxVal) * (H - 8)
            // Invert: higher response time → higher Y (lower on chart)
            return Math.max(4, Math.min(H - 4, H - 4 - normalized))
          })
        })()
      : Array.from({ length: 24 }, (_, i) => {
          const base = status === "operational" ? 40 : status === "degraded" ? 55 : 75
          const jitter = Math.sin(i * 1.3) * 12 + Math.cos(i * 0.7) * 8
          return Math.max(4, Math.min(H - 4, base + jitter))
        })
  const polyline = pts.map((y, i) => `${(i / (pts.length - 1)) * W},${y}`).join(" ")
  const fillPts = `0,${H} ${polyline} ${W},${H}`
  const { stroke, fill } = SPARKLINE_COLORS[status]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded bg-zinc-900"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <polygon points={fillPts} fill={fill} />
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}
