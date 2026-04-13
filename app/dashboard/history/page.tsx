"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { Download, History, Search, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { useRole } from "@/src/infrastructure/services/useRole"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import { Badge } from "@/app/components/ui/badge"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip"

import { CutHistoryStats } from "./_components/cut-history-stats"
import { DateRangePicker } from "./_components/date-range-picker"
import { UserSelect } from "./_components/user-select"

// ── Types ──────────────────────────────────────────────────────────────────────

interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

interface User {
  id: string
  full_name: string | null
  email: string | null
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

function FabScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const variant = score >= 0.8 ? "default" : score >= 0.55 ? "secondary" : "destructive"
  return <Badge variant={variant}>{pct}%</Badge>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CutHistoryPage() {
  const { isAdmin, isManager, hasAnyRole, isLoading: roleLoading, userId } = useRole()

  const showDropdown = isAdmin || isManager || hasAnyRole(["supervisor"])
  const canDelete = isAdmin || isManager

  // ── State ────────────────────────────────────────────────────────────────────
  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [users, setUsers] = useState<User[]>([])
  // undefined = not yet initialized (wait for userId from useRole)
  const [selectedUserId, setSelectedUserId] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; cutId: number | null }>({
    open: false,
    cutId: null,
  })
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  })

  const initializedRef = useRef(false)

  // ── Init selectedUserId once role loads ──────────────────────────────────────
  useEffect(() => {
    if (roleLoading || initializedRef.current) return
    initializedRef.current = true
    setSelectedUserId(userId)
  }, [roleLoading, userId])

  // ── Load history + favorites ─────────────────────────────────────────────────
  const loadHistory = useCallback(
    async (forUserId: string | null) => {
      setLoading(true)
      try {
        const from = dateRange.from.toISOString()
        const to = new Date(new Date(dateRange.to).setHours(23, 59, 59, 999)).toISOString()
        const userParam = forUserId ? `&userId=${encodeURIComponent(forUserId)}` : ""
        const res = await fetchJson<{ data: CutHistory[] }>(
          `/api/cuts/history?limit=100&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${userParam}`
        )

        let favSet = new Set<number>()
        try {
          const favRes = await fetchJson<{ data: number[] }>("/api/cuts/favorites")
          favSet = new Set(favRes.data)
        } catch (_err) {
          // silently ignore — favorites table may not be migrated yet
        }

        const merged: CutHistoryRow[] = (res.data ?? [])
          .map((c) => ({ ...c, isFavorite: favSet.has(c.id) }))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
          })

        setCuts(merged)
        setFavoriteIds(favSet)
      } catch (err) {
        console.error("Error fetching cut history:", err)
        toast.error("Failed to load cut history")
        setCuts([])
      } finally {
        setLoading(false)
      }
    },
    [dateRange]
  )

  // ── Fetch users for dropdown ─────────────────────────────────────────────────
  useEffect(() => {
    if (!showDropdown) return
    fetchJson<{ data: User[] }>("/api/users")
      .then((res) => setUsers(res.data))
      .catch(() => {})
  }, [showDropdown])

  // ── Reload when user selection or date range changes ─────────────────────────
  useEffect(() => {
    if (selectedUserId === undefined) return
    loadHistory(selectedUserId)
  }, [selectedUserId, loadHistory])

  // ── Toggle favorite ──────────────────────────────────────────────────────────
  async function handleToggleFavorite(id: number) {
    const wasOn = favoriteIds.has(id)

    // Optimistic update
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      wasOn ? next.delete(id) : next.add(id)
      return next
    })
    setCuts((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, isFavorite: !wasOn } : c))
        .sort((a, b) => {
          const aFav = a.id === id ? !wasOn : a.isFavorite
          const bFav = b.id === id ? !wasOn : b.isFavorite
          if (aFav !== bFav) return aFav ? -1 : 1
          return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
        })
    )

    const res = await fetch("/api/cuts/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cut_history_id: id }),
    })

    if (!res.ok) {
      // Roll back on failure
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        wasOn ? next.add(id) : next.delete(id)
        return next
      })
      setCuts((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, isFavorite: wasOn } : c))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
          })
      )
      toast.error("Failed to update favorite")
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────────
  async function handleConfirmDelete() {
    const { cutId } = deleteConfirm
    if (cutId === null) return
    try {
      const res = await fetch(`/api/cuts/history/${cutId}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setCuts((prev) => prev.filter((c) => c.id !== cutId))
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        next.delete(cutId)
        return next
      })
      toast.success("Cut record deleted")
    } catch {
      toast.error("Failed to delete cut record")
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────
  const favCount = useMemo(() => cuts.filter((c) => c.isFavorite).length, [cuts])

  const displayedCuts = useMemo(() => {
    let result = showFavoritesOnly ? cuts.filter((c) => c.isFavorite) : cuts
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase()
      result = result.filter((cut) => {
        const partLabel = (PART_LABELS[cut.part_id] ?? "").toLowerCase()
        const sizes = (cut.part_selected_label ?? []).join(" ").toLowerCase()
        const date = format(new Date(cut.cut_date), "MMM d, yyyy HH:mm").toLowerCase()
        return partLabel.includes(lower) || sizes.includes(lower) || date.includes(lower)
      })
    }
    return result
  }, [cuts, showFavoritesOnly, searchTerm])

  // Star + 9 data cols + optional delete
  const totalColSpan = 1 + 9 + (canDelete ? 1 : 0)

  // ── CSV export ───────────────────────────────────────────────────────────────
  function exportToCsv() {
    const headers = [
      "Cut Date", "Part Type", "Stock (W×L×T)", "Qty",
      "Parts Done", "Mat Used (ft²)", "Reuse (ft²)", "Scrap (ft²)", "Fab Score",
    ]
    const csvData = displayedCuts.map((cut) => [
      format(new Date(cut.cut_date), "yyyy-MM-dd HH:mm:ss"),
      PART_LABELS[cut.part_id] ?? `Part ${cut.part_id}`,
      `${cut.cut_width}" × ${cut.cut_length}" × ${cut.cut_thickness}"`,
      cut.cut_amount.toString(),
      cut.parts_completed.toString(),
      cut.material_used_sqft.toFixed(2),
      cut.reusable_offset_sqft.toFixed(2),
      cut.scrap_sqft.toFixed(2),
      `${Math.round(cut.fab_score * 100)}%`,
    ])
    const csv = [headers, ...csvData].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `cut-history-${format(new Date(), "yyyy-MM-dd")}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4 md:gap-6">

        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <History className="h-6 w-6" />
              Cut History
            </h1>
            <p className="text-sm text-muted-foreground">
              View and analyze all cutting operations with detailed waste tracking
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showDropdown && !roleLoading && (
              <UserSelect
                users={users}
                selectedUserId={selectedUserId ?? null}
                currentUserId={userId}
                onUserChange={setSelectedUserId}
              />
            )}
            <Button onClick={exportToCsv} variant="outline" size="sm" disabled={loading}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <CutHistoryStats cuts={displayedCuts} />

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by part type, size, or date…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
            <div>
              <CardTitle>Cut Records</CardTitle>
              <CardDescription>
                {displayedCuts.length} of {cuts.length} records shown
                {showFavoritesOnly && " (favorites)"}
              </CardDescription>
            </div>
            <Button
              variant={showFavoritesOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowFavoritesOnly((v) => !v)}
              className="shrink-0 gap-1.5"
              disabled={!showFavoritesOnly && favCount === 0}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={showFavoritesOnly ? "currentColor" : "none"}
                strokeWidth={1.5}
              />
              Favorites
              {favCount > 0 && (
                <span className="ml-0.5 text-xs opacity-70">({favCount})</span>
              )}
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="bg-slate-100 dark:bg-slate-800/50">
                    <TableHead className="w-8 px-2" />
                    <TableHead className="min-w-[110px] pl-2">Cut Date</TableHead>
                    <TableHead className="min-w-[110px]">Part</TableHead>
                    <TableHead className="min-w-[140px] whitespace-nowrap">Stock (W×L×T)</TableHead>
                    <TableHead className="text-right min-w-[40px]">Qty</TableHead>
                    <TableHead className="text-right min-w-[68px] whitespace-nowrap">Parts Done</TableHead>
                    <TableHead className="text-right min-w-[80px] whitespace-nowrap">Mat Used</TableHead>
                    <TableHead className="text-right min-w-[64px]">Reuse</TableHead>
                    <TableHead className="text-right min-w-[64px]">Scrap</TableHead>
                    <TableHead className="text-right min-w-[72px] whitespace-nowrap">Fab Score</TableHead>
                    {canDelete && <TableHead className="w-9" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={totalColSpan} className="py-10 text-center text-muted-foreground">
                        Loading cut history…
                      </TableCell>
                    </TableRow>
                  ) : displayedCuts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={totalColSpan} className="py-10 text-center text-muted-foreground">
                        No cut records found for the selected criteria.
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedCuts.map((cut) => (
                      <TableRow
                        key={cut.id}
                        className={cut.isFavorite ? "bg-amber-50/40 dark:bg-amber-950/20" : undefined}
                      >
                        {/* Favorite star */}
                        <TableCell className="px-2">
                          <button
                            type="button"
                            aria-label={cut.isFavorite ? "Remove from favorites" : "Add to favorites"}
                            onClick={() => handleToggleFavorite(cut.id)}
                            className="text-muted-foreground hover:text-amber-400 transition-colors"
                          >
                            <Star
                              className="h-4 w-4"
                              fill={cut.isFavorite ? "#f59e0b" : "none"}
                              stroke={cut.isFavorite ? "#f59e0b" : "currentColor"}
                              strokeWidth={1.5}
                            />
                          </button>
                        </TableCell>

                        {/* Date */}
                        <TableCell className="pl-2 whitespace-nowrap">
                          <div className="font-medium">
                            {format(new Date(cut.cut_date), "MMM d, yyyy")}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(cut.cut_date), "HH:mm:ss")}
                          </div>
                        </TableCell>

                        {/* Part */}
                        <TableCell className="font-medium">
                          {PART_LABELS[cut.part_id] ?? `Part ${cut.part_id}`}
                        </TableCell>

                        {/* Stock dimensions */}
                        <TableCell className="font-mono whitespace-nowrap">
                          {cut.cut_width}" × {cut.cut_length}" × {cut.cut_thickness}"
                        </TableCell>

                        <TableCell className="text-right tabular-nums">{cut.cut_amount}</TableCell>
                        <TableCell className="text-right tabular-nums">{cut.parts_completed}</TableCell>

                        <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                          {cut.material_used_sqft.toFixed(2)} ft²
                        </TableCell>

                        <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                          {cut.reusable_offset_sqft.toFixed(2)} ft²
                        </TableCell>

                        <TableCell className="text-right tabular-nums font-mono whitespace-nowrap">
                          {cut.scrap_sqft.toFixed(2)} ft²
                        </TableCell>

                        <TableCell className="text-right">
                          <FabScoreBadge score={cut.fab_score} />
                        </TableCell>

                        {/* Delete — admin/manager only */}
                        {canDelete && (
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirm({ open: true, cutId: cut.id })}
                                  aria-label="Delete cut record"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete cut record</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Delete confirmation */}
        <ConfirmationDialog
          open={deleteConfirm.open}
          onOpenChange={(open) => setDeleteConfirm((s) => ({ ...s, open }))}
          onConfirm={handleConfirmDelete}
          title="Delete Cut Record?"
          description="This will permanently remove this cut record. This action cannot be undone."
          confirmText="Delete"
          variant="danger"
        />
      </div>
    </TooltipProvider>
  )
}
