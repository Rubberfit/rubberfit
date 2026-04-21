"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { toast } from "sonner"

import { type CutHistory } from "@/src/entities"
import { useRole } from "@/src/infrastructure/services/useRole"
import { cutHistoryService } from "@/src/infrastructure/services/cutHistoryService"

export interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

export interface User {
  id: string
  full_name: string | null
  email: string | null
}

export const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export function useCutHistory() {
  const router = useRouter()
  const { isAdmin, isManager, hasAnyRole, isLoading: roleLoading, userId } = useRole()

  const showDropdown = isAdmin || isManager || hasAnyRole(["supervisor"])
  const canDelete = isAdmin || isManager

  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; cutId: string | null }>({
    open: false,
    cutId: null,
  })
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  })

  const initializedRef = useRef(false)

  // Privileged users default to all-users view; others scoped to self.
  useEffect(() => {
    if (roleLoading || initializedRef.current) return
    initializedRef.current = true
    setSelectedUserId(showDropdown ? null : userId)
  }, [roleLoading, userId, showDropdown])

  const loadHistory = useCallback(
    async (forUserId: string | null) => {
      setLoading(true)
      try {
        const to = new Date(new Date(dateRange.to).setHours(23, 59, 59, 999))

        const [history, favIds] = await Promise.all([
          cutHistoryService.list({
            from: dateRange.from,
            to,
            userId: forUserId,
            limit: 100,
          }),
          userId
            ? cutHistoryService.listFavoriteIds(userId).catch(() => [] as string[])
            : Promise.resolve([] as string[]),
        ])

        const favSet = new Set(favIds)
        const merged: CutHistoryRow[] = history
          .map((c) => ({ ...c, isFavorite: favSet.has(c.id) }))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cutDate).getTime() - new Date(a.cutDate).getTime()
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
    [dateRange, userId]
  )

  useEffect(() => {
    if (!showDropdown) return
    fetchJson<{ data: User[] }>("/api/users")
      .then((res) => setUsers(res.data))
      .catch((err) => {
        console.error("Error fetching users:", err)
        toast.error("Failed to load user filter")
      })
  }, [showDropdown])

  useEffect(() => {
    if (selectedUserId === undefined) return
    loadHistory(selectedUserId)
  }, [selectedUserId, loadHistory])

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

  const handleToggleFavorite = useCallback(
    async (id: string) => {
      if (!userId) return
      const wasOn = favoriteIds.has(id)

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (wasOn) next.delete(id)
        else next.add(id)
        return next
      })
      setCuts((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, isFavorite: !wasOn } : c))
          .sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
            return new Date(b.cutDate).getTime() - new Date(a.cutDate).getTime()
          })
      )

      try {
        await cutHistoryService.toggleFavorite(userId, id)
      } catch (err) {
        console.error("toggleFavorite failed:", err)
        // Roll back
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (wasOn) next.add(id)
          else next.delete(id)
          return next
        })
        setCuts((prev) =>
          prev
            .map((c) => (c.id === id ? { ...c, isFavorite: wasOn } : c))
            .sort((a, b) => {
              if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
              return new Date(b.cutDate).getTime() - new Date(a.cutDate).getTime()
            })
        )
        toast.error("Failed to update favorite")
      }
    },
    [favoriteIds, userId]
  )

  const handleConfirmDelete = useCallback(async () => {
    const { cutId } = deleteConfirm
    if (cutId === null) return
    try {
      await cutHistoryService.delete(cutId)
      setCuts((prev) => prev.filter((c) => c.id !== cutId))
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        next.delete(cutId)
        return next
      })
      toast.success("Cut record deleted")
    } catch (err) {
      console.error("delete failed:", err)
      toast.error("Failed to delete cut record")
    }
  }, [deleteConfirm])

  const handleReopen = useCallback(
    (cutId: string) => {
      router.push(`/dashboard/cut-planner?loadCut=${cutId}`)
    },
    [router]
  )

  const favCount = useMemo(() => cuts.filter((c) => c.isFavorite).length, [cuts])

  const displayedCuts = useMemo(() => {
    let result = showFavoritesOnly ? cuts.filter((c) => c.isFavorite) : cuts
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase()
      result = result.filter((cut) => {
        const stockLabel = (cut.stockLabel ?? "").toLowerCase()
        const date = format(new Date(cut.cutDate), "MMM d, yyyy HH:mm").toLowerCase()
        return stockLabel.includes(lower) || date.includes(lower)
      })
    }
    return result
  }, [cuts, showFavoritesOnly, searchTerm])

  const totalColSpan = 1 + 9 + 1

  const exportToCsv = useCallback(() => {
    const headers = [
      "Cut Date",
      "Stock Label",
      "Stock (W×L×T)",
      "Qty",
      "Parts Done",
      "Mat Used (ft²)",
      "Scrap (ft²)",
      "Fab Score",
    ]
    const csvData = displayedCuts.map((cut) => [
      format(new Date(cut.cutDate), "yyyy-MM-dd HH:mm:ss"),
      cut.stockLabel ?? "",
      `${cut.cutWidth.toInches().toFixed(2)}" × ${cut.cutLength.toInches().toFixed(2)}" × ${cut.cutThickness?.toInches().toFixed(3) ?? "-"}"`,
      cut.cutAmount.toString(),
      cut.partsCompleted.toString(),
      cut.materialUsed.toSqft().toFixed(2),
      cut.scrap.toSqft().toFixed(2),
      `${Math.round((cut.fabScore?.toFraction() ?? 0) * 100)}%`,
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
    cuts,
    displayedCuts,
    users,
    selectedUserId,
    setSelectedUserId,
    searchTerm,
    setSearchTerm,
    showFavoritesOnly,
    setShowFavoritesOnly,
    dateRange,
    setDateRange,
    loading,
    favCount,
    totalColSpan,
    deleteConfirm,
    setDeleteConfirm,
    showDropdown,
    canDelete,
    roleLoading,
    userId,
    handleToggleFavorite,
    handleConfirmDelete,
    handleReopen,
    exportToCsv,
  }
}
