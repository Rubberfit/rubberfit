"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { History } from "lucide-react"
import { toast } from "sonner"

import { type CutHistory } from "@/src/infrastructure/models/supabase"
import { useRole } from "@/src/infrastructure/services/useRole"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import { TooltipProvider } from "@/app/components/ui/tooltip"

import { HistoryTable } from "./_components/history-table"
import { UserSelect } from "./_components/user-select"

interface CutHistoryRow extends CutHistory {
  isFavorite: boolean
}

interface DeleteConfirm {
  open: boolean
  cutId: number | null
}

interface User {
  id: string
  full_name: string | null
  email: string | null
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export default function CutPlannerHistoryPage() {
  const { isAdmin, isManager, isCutter, hasAnyRole, isLoading: roleLoading, userId } = useRole()

  const showDropdown = isAdmin || isManager || hasAnyRole(["supervisor"])
  // Admins/managers can delete any record; cutters can delete their own (enforced per-row)
  const canDeleteAll = isAdmin || isManager
  const cutterCanDelete = isCutter && !canDeleteAll

  const [cuts, setCuts] = useState<CutHistoryRow[]>([])
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set())
  const [users, setUsers] = useState<User[]>([])
  // undefined = not yet initialized (wait for userId from useRole)
  const [selectedUserId, setSelectedUserId] = useState<string | null | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false, cutId: null })

  // Track whether the user has manually changed the dropdown (prevent re-initialization)
  const initializedRef = useRef(false)

  // ── Set default selection to current user once role loads ─────────────────────
  useEffect(() => {
    if (roleLoading || initializedRef.current) return
    initializedRef.current = true
    setSelectedUserId(userId)
  }, [roleLoading, userId])

  // ── Fetch history ─────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (forUserId: string | null) => {
    setIsLoading(true)
    try {
      const url = forUserId
        ? `/api/cuts/history?limit=100&userId=${forUserId}`
        : "/api/cuts/history?limit=100"

      const historyRes = await fetchJson<{ data: CutHistory[] }>(url)

      // Favorites are non-fatal — degrade gracefully if migration hasn't been run yet
      let favSet = new Set<number>()
      try {
        const favRes = await fetchJson<{ data: number[] }>("/api/cuts/favorites")
        favSet = new Set(favRes.data)
      } catch (_err) {
        // silently ignore
      }

      // Favorites float to top, rest sorted by cut_date desc
      const merged: CutHistoryRow[] = historyRes.data
        .map((c) => ({ ...c, isFavorite: favSet.has(c.id) }))
        .sort((a, b) => {
          if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
          return new Date(b.cut_date).getTime() - new Date(a.cut_date).getTime()
        })

      setCuts(merged)
      setFavoriteIds(favSet)
    } catch (err) {
      console.error("Failed to load history:", err)
      toast.error("Failed to load cut history")
    } finally {
      setIsLoading(false)
    }
  }, [])

  // ── Fetch users for dropdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (!showDropdown) return
    fetchJson<{ data: User[] }>("/api/users")
      .then((res) => setUsers(res.data))
      .catch(() => {
        // Non-fatal — dropdown just won't populate
      })
  }, [showDropdown])

  // ── Reload when selection changes (skip undefined sentinel) ───────────────────
  useEffect(() => {
    if (selectedUserId === undefined) return
    loadHistory(selectedUserId)
  }, [selectedUserId, loadHistory])

  // ── Toggle favorite ───────────────────────────────────────────────────────────
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
      // Roll back on hard failure (non-table-missing errors)
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

  // ── Delete ────────────────────────────────────────────────────────────────────
  function handleDeleteClick(id: number) {
    setDeleteConfirm({ open: true, cutId: id })
  }

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

  // ── Derived stats ─────────────────────────────────────────────────────────────
  const totalCuts = cuts.length
  const avgFabScore =
    cuts.length > 0 ? cuts.reduce((sum, c) => sum + c.fab_score, 0) / cuts.length : 0
  const totalMatUsed = cuts.reduce((sum, c) => sum + c.material_used_sqft, 0)

  const viewingOwn = selectedUserId === userId

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
              {viewingOwn ? "Your recorded cut operations" : "Viewing another user's cut history"}
            </p>
          </div>

          {/* User dropdown — admin / manager / supervisor only */}
          {showDropdown && !roleLoading && (
            <UserSelect
              users={users}
              selectedUserId={selectedUserId ?? null}
              currentUserId={userId}
              onUserChange={setSelectedUserId}
            />
          )}
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1 pt-4">
              <CardDescription>Total Cuts</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold tabular-nums">{totalCuts}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1 pt-4">
              <CardDescription>Avg Fab Score</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold tabular-nums">
                {cuts.length > 0 ? avgFabScore.toFixed(1) : "—"}
              </p>
            </CardContent>
          </Card>

          <Card className="col-span-2 sm:col-span-1">
            <CardHeader className="pb-1 pt-4">
              <CardDescription>Total Mat Used</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <p className="text-2xl font-bold tabular-nums">
                {totalMatUsed > 0 ? `${totalMatUsed.toFixed(1)} ft²` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main table */}
        <Card>
          <CardHeader>
            <CardTitle>Cut Records</CardTitle>
            <CardDescription>
              {totalCuts} {totalCuts === 1 ? "record" : "records"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <HistoryTable
              cuts={cuts}
              isLoading={isLoading}
              canDeleteAll={canDeleteAll}
              cutterCanDelete={cutterCanDelete}
              currentUserId={userId}
              onToggleFavorite={handleToggleFavorite}
              onDeleteClick={handleDeleteClick}
            />
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
