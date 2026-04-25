"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "sonner"

import { listCutHistory, listFavoriteIds } from "@/src/infrastructure/api-client/cut-history"
import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { isLayoutModelArray } from "@/app/dashboard/cutting-engine/_components/layout-model"
import { useRegenerateCutPdf } from "@/app/hooks/use-regenerate-cut-pdf"
import { useRole } from "@/src/infrastructure/services/useRole"

// Types

export interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

export interface User {
  id: string
  full_name: string | null
  email: string | null
}

// Constants

export const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

// Helpers

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

// Hook

export function useCutHistory() {
  const router = useRouter()
  const { isAdmin, isManager, hasAnyRole, isLoading: roleLoading, userId } = useRole()

  const showDropdown = isAdmin || isManager || hasAnyRole(["supervisor"])
  const canDelete = isAdmin || isManager

  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<User[]>([])
  // undefined = not yet initialized (wait for userId from useRole)
  const [selectedUserId, setSelectedUserId] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; cutId: string | null }>({
    open: false,
    cutId: null,
  })
  const { pendingIds: pendingPdfIds, regenerate: regenerateCutPdf } = useRegenerateCutPdf()
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  })

  const initializedRef = useRef(false)

  // Init selectedUserId once role loads
  useEffect(() => {
    if (roleLoading || initializedRef.current) return
    initializedRef.current = true
    setSelectedUserId(userId)
  }, [roleLoading, userId])

  // Load history + favorites. Delegates to the api-client module so
  // the hook stays agnostic to which backend (v1 Supabase direct vs
  // v2 Rust) is actually serving the data — the flag flip lives
  // entirely in `src/infrastructure/api-client/cut-history.ts`.
  const loadHistory = useCallback(
    async (forUserId: string | null) => {
      setLoading(true)
      try {
        const fromIso = dateRange.from.toISOString()
        const toIso = new Date(new Date(dateRange.to).setHours(23, 59, 59, 999)).toISOString()

        const [rows, favorites] = await Promise.all([
          listCutHistory({
            from: fromIso,
            to: toIso,
            limit: 100,
            userId: forUserId ?? undefined,
          }),
          listFavoriteIds().catch(() => ({ ids: new Set<string>() })),
        ])

        const merged: CutHistoryRow[] = rows
          .map((c) => ({ ...c, isFavorite: favorites.ids.has(c.id) }))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
          })

        setCuts(merged)
        setFavoriteIds(favorites.ids)
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

  // Fetch users for dropdown
  useEffect(() => {
    if (!showDropdown) return
    fetchJson<{ data: User[] }>("/api/users")
      .then((res) => setUsers(res.data))
      .catch((_error) => {
        console.error("Error fetching users:", _error)
        toast.error("Failed to load user filter")
      })
  }, [showDropdown])

  // Reload when user selection or date range changes
  useEffect(() => {
    if (selectedUserId === undefined) return
    loadHistory(selectedUserId)
  }, [selectedUserId, loadHistory])

  // Refetch when the tab becomes visible (e.g. after recording a cut on the planner page)
  const lastFetchRef = useRef(0)
  useEffect(() => {
    if (selectedUserId === undefined) return
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetchRef.current > 30_000) {
        lastFetchRef.current = Date.now()
        loadHistory(selectedUserId)
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [selectedUserId, loadHistory])

  // Toggle favorite
  const handleToggleFavorite = useCallback(
    async (id: string) => {
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

      try {
        const res = await fetch("/api/cuts/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cut_history_id: id }),
        })

        if (!res.ok) throw new Error("not ok")
      } catch (_error) {
        // Roll back on network error or non-2xx response
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
    },
    [favoriteIds]
  )

  // Delete
  const handleConfirmDelete = useCallback(async () => {
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
  }, [deleteConfirm])

  // Open the PDF for a cut. If the row already has a `pdf_url`, open it
  // directly. Otherwise delegate to `useRegenerateCutPdf` which calls
  // the on-demand endpoint (`POST /api/cuts/history/[id]/pdf`), which
  // builds the PDF from the persisted `layout_json` snapshot, uploads
  // it, persists `pdf_url` on the row, and returns the URL. Issue #127:
  // the save-time path can leave `pdf_url = null` when the browser
  // navigates away mid-upload or storage rejects, so the button used
  // to disappear forever — this path heals those rows on first click.
  const handleViewPdf = useCallback(
    async (cutId: string) => {
      const row = cuts.find((c) => c.id === cutId)
      if (row?.pdf_url) {
        window.open(row.pdf_url, "_blank")
        return
      }

      const url = await regenerateCutPdf(cutId)
      if (!url) return
      setCuts((prev) => prev.map((c) => (c.id === cutId ? { ...c, pdf_url: url } : c)))
      window.open(url, "_blank")
    },
    [cuts, regenerateCutPdf]
  )

  // Navigate back to the surface that produced the cut — Auto nest
  // for `source: "auto"` rows, Free roam for `source: "manual"` so
  // manual layouts re-hydrate onto the CAD canvas instead of landing
  // on the preset picker (which can't represent free placements).
  const handleReopen = useCallback(
    (cutId: string) => {
      const cut = cuts.find((c) => c.id === cutId)
      const target =
        cut?.source === "manual"
          ? `/dashboard/cutting-engine/free-roam?loadCut=${cutId}`
          : `/dashboard/cutting-engine?loadCut=${cutId}`
      router.push(target)
    },
    [cuts, router]
  )

  // Derived
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

  // Star + 9 data cols + actions
  const totalColSpan = 1 + 9 + 1

  // CSV export
  const exportToCsv = useCallback(() => {
    const headers = [
      "Cut Date",
      "Part Type",
      "Stock (W×L×T)",
      "Qty",
      "Parts Done",
      "Mat Used (ft²)",
      "Reuse (ft²)",
      "Scrap (ft²)",
      "Fab Score",
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
  }, [displayedCuts])

  return {
    // Data
    cuts,
    displayedCuts,
    users,
    // Filters
    selectedUserId,
    setSelectedUserId,
    searchTerm,
    setSearchTerm,
    showFavoritesOnly,
    setShowFavoritesOnly,
    dateRange,
    setDateRange,
    // UI state
    loading,
    favCount,
    totalColSpan,
    deleteConfirm,
    setDeleteConfirm,
    // Role
    showDropdown,
    canDelete,
    roleLoading,
    userId,
    // PDF
    pendingPdfIds,
    // Handlers
    handleToggleFavorite,
    handleConfirmDelete,
    handleReopen,
    handleViewPdf,
    exportToCsv,
  }
}

/**
 * `true` when the cut row has either a stored `pdf_url` (button opens
 * directly) or a frozen auto-nest layout we can regenerate from on
 * demand. `false` only for legacy rows that can never produce a PDF —
 * those render the button disabled with a tooltip.
 */
export function canViewPdf(cut: CutHistory): boolean {
  if (cut.pdf_url) return true
  const layout = cut.layout_json
  if (!layout || layout.kind !== "auto") return false
  return isLayoutModelArray(layout.layouts)
}
