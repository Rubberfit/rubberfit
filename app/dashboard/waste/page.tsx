"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, subDays, subWeeks, subMonths, startOfWeek, startOfMonth } from "date-fns"
import { Download, TrendingDown } from "lucide-react"
import { toast } from "sonner"

import { type CutHistory } from "@/src/entities"
import { useRole } from "@/src/infrastructure/services/useRole"
import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

import { WasteKpiCards } from "./_components/waste-kpi-cards"
import { WasteRatioTrendChart, type TrendPoint } from "./_components/waste-ratio-trend-chart"

// ── Types ─────────────────────────────────────────────────────────────────────

type Timeframe = "7d" | "30d" | "12w" | "12m"
type GroupBy = "day" | "week" | "month"

interface User {
  id: string
  full_name: string | null
  email: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

function getRange(tf: Timeframe): { from: Date; to: Date; groupBy: GroupBy } {
  const to = new Date()
  switch (tf) {
    case "7d":
      return { from: subDays(to, 7), to, groupBy: "day" }
    case "30d":
      return { from: subDays(to, 30), to, groupBy: "day" }
    case "12w":
      return { from: subWeeks(to, 12), to, groupBy: "week" }
    case "12m":
      return { from: subMonths(to, 12), to, groupBy: "month" }
  }
}

function groupCuts(cuts: CutHistory[], groupBy: GroupBy): TrendPoint[] {
  const buckets = new Map<string, CutHistory[]>()

  for (const cut of [...cuts].sort(
    (a, b) => new Date(a.cut_date).getTime() - new Date(b.cut_date).getTime()
  )) {
    const d = new Date(cut.cut_date)
    const key =
      groupBy === "day"
        ? format(d, "MMM d")
        : groupBy === "week"
          ? format(startOfWeek(d), "MMM d")
          : format(startOfMonth(d), "MMM yyyy")
    const arr = buckets.get(key) ?? []
    arr.push(cut)
    buckets.set(key, arr)
  }

  return Array.from(buckets.entries()).map(([period, items]) => {
    const avgFab = items.reduce((s, c) => s + c.fab_score, 0) / items.length
    const scrap = items.reduce((s, c) => s + c.scrap_sqft, 0)
    const reusable = items.reduce((s, c) => s + c.reusable_offset_sqft, 0)
    const material = items.reduce((s, c) => s + c.material_used_sqft, 0)
    const total = scrap + reusable + material
    return {
      period,
      wasteRatio: parseFloat(((1 - avgFab) * 100).toFixed(1)),
      scrapRatio: total > 0 ? parseFloat(((scrap / total) * 100).toFixed(1)) : 0,
      cuts: items.length,
      totalScrap: parseFloat(scrap.toFixed(2)),
      totalMaterial: parseFloat(material.toFixed(2)),
    }
  })
}

function exportCsv(trend: TrendPoint[], cuts: CutHistory[], timeframe: Timeframe) {
  const trendRows = [
    ["Period", "Cuts", "Avg Waste %", "Pure Scrap %", "Total Scrap ft²", "Total Material ft²"],
    ...trend.map((t) => [
      t.period,
      String(t.cuts),
      t.wasteRatio.toFixed(1),
      t.scrapRatio.toFixed(1),
      t.totalScrap.toFixed(2),
      t.totalMaterial.toFixed(2),
    ]),
  ]

  const rawRows = [
    [],
    [
      "Cut Date",
      "Part Type",
      "Qty",
      "Waste %",
      "Scrap ft²",
      "Reusable ft²",
      "Material ft²",
      "Fab Score",
    ],
    ...cuts.map((c) => [
      format(new Date(c.cut_date), "yyyy-MM-dd HH:mm"),
      String(c.part_id),
      String(c.cut_amount),
      ((1 - c.fab_score) * 100).toFixed(1),
      c.scrap_sqft.toFixed(2),
      c.reusable_offset_sqft.toFixed(2),
      c.material_used_sqft.toFixed(2),
      c.fab_score.toFixed(3),
    ]),
  ]

  const csv = [...trendRows, ...rawRows].map((r) => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `waste-analysis-${timeframe}-${format(new Date(), "yyyy-MM-dd")}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
  "12w": "Last 12 Weeks",
  "12m": "Last 12 Months",
}

export default function WasteAnalysisPage() {
  const { isAdmin, isManager, hasAnyRole, isLoading: roleLoading, userId } = useRole()
  const showUserSelect = isAdmin || isManager || hasAnyRole(["supervisor"])

  const [cuts, setCuts] = useState<CutHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState<Timeframe>("30d")
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null | undefined>(undefined)

  const initializedRef = useRef(false)

  useEffect(() => {
    if (roleLoading || initializedRef.current) return
    initializedRef.current = true
    setSelectedUserId(userId)
  }, [roleLoading, userId])

  // Load users for privileged dropdown
  useEffect(() => {
    if (!showUserSelect) return
    fetchJson<{ data: User[] }>("/api/users")
      .then((r) => setUsers(r.data))
      .catch(() => {})
  }, [showUserSelect])

  const loadCuts = useCallback(
    async (forUserId: string | null) => {
      setLoading(true)
      try {
        const { from, to } = getRange(timeframe)
        const fromStr = from.toISOString()
        const endOfDay = new Date(to)
        endOfDay.setHours(23, 59, 59, 999)
        const userParam = forUserId ? `&userId=${encodeURIComponent(forUserId)}` : ""
        const toStr = endOfDay.toISOString()
        const res = await fetchJson<{ data: CutHistory[] }>(
          `/api/cuts/history?limit=100&from=${encodeURIComponent(fromStr)}&to=${encodeURIComponent(toStr)}${userParam}`
        )
        setCuts(res.data ?? [])
      } catch (_err) {
        toast.error("Failed to load waste data")
        setCuts([])
      } finally {
        setLoading(false)
      }
    },
    [timeframe]
  )

  useEffect(() => {
    if (selectedUserId === undefined) return
    loadCuts(selectedUserId)
  }, [selectedUserId, loadCuts])

  const { groupBy } = getRange(timeframe)
  const trendData = useMemo(() => groupCuts(cuts, groupBy), [cuts, groupBy])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingDown className="h-6 w-6" />
            Waste Analysis
          </h1>
          <p className="text-sm text-muted-foreground">
            Waste ratio trends derived from recorded cut history
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {showUserSelect && !roleLoading && (
            <Select
              value={selectedUserId ?? "all"}
              onValueChange={(v) => setSelectedUserId(v === "all" ? null : v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All cutters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cutters</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name ?? u.email ?? u.id}
                    {u.id === userId ? " (you)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={timeframe} onValueChange={(v) => setTimeframe(v as Timeframe)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(TIMEFRAME_LABELS) as [Timeframe, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={loading || cuts.length === 0}
            onClick={() => exportCsv(trendData, cuts, timeframe)}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <WasteKpiCards cuts={cuts} isLoading={loading} />

      {/* Trend Chart */}
      <WasteRatioTrendChart data={trendData} isLoading={loading} />
    </div>
  )
}
