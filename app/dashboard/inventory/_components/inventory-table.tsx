"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Package2 } from "lucide-react"
import { toast } from "sonner"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { Button } from "@/app/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/app/components/ui/table"
import { EmptyState } from "@/app/components/patterns"
import { cn } from "@/app/lib/utils"

import { InventoryRow, type InventoryRowAction } from "./inventory-row"
import { RollDetailDrawer } from "./roll-detail-drawer"
import { RollFormDialog } from "./roll-form-dialog"
import { useRolls } from "./use-rolls"

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 25

/**
 * Rolls list — the primary surface on the inventory landing page.
 *
 * Row click opens a detail drawer (`RollDetailDrawer`) that shows
 * the blank-sheet preview, summary metrics, and quick actions
 * (edit, open in cutting engine). The action dropdown on each row
 * gathers the three administrative operations (edit, mark
 * depleted, delete) so the row itself stays scannable; all three
 * destructive flows route through the shared `AlertDialog` — the
 * previous `window.confirm` path was removed in this pass.
 */

interface InventoryTableProps {
  searchQuery?: string
  canManageRolls?: boolean
  refreshKey?: number
  onMutated?: () => void
  /**
   * When set (e.g. from a QR scan routing into the inventory via
   * `?scan=<part_number>`), the first matching roll in the loaded
   * list auto-opens the detail drawer. One-shot — consumed on
   * first render after the list lands so a refresh doesn't re-fire.
   */
  scanPartNumber?: string
  onScanResolved?: () => void
}

type PendingAction = { type: "delete"; rollId: string } | { type: "deplete"; rollId: string } | null

export function InventoryTable({
  searchQuery = "",
  canManageRolls = false,
  refreshKey = 0,
  onMutated,
  scanPartNumber,
  onScanResolved,
}: InventoryTableProps) {
  const { rolls, loading, refresh } = useRolls(searchQuery)
  const [drawerRoll, setDrawerRoll] = useState<Roll | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingRoll, setEditingRoll] = useState<Roll | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const scanHandledRef = useRef<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)

  const totalRolls = rolls.length
  const totalPages = Math.max(1, Math.ceil(totalRolls / pageSize))
  // `page` can hold a stale value when search / dataset shrinks the
  // list; `safePage` is the authoritative render value. Nav handlers
  // below also clamp through it so Prev/Next never overshoot.
  const safePage = Math.min(Math.max(1, page), totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = Math.min(pageStart + pageSize, totalRolls)
  const pageRolls = useMemo(() => rolls.slice(pageStart, pageEnd), [rolls, pageStart, pageEnd])

  // Resolve a scan-in part number as soon as the rolls list is
  // loaded. Compared against `part_number` first, then falls back
  // to id for legacy rolls whose part numbers predate the sequence.
  useEffect(() => {
    if (!scanPartNumber) return
    if (scanHandledRef.current === scanPartNumber) return
    if (loading || rolls.length === 0) return
    const target = scanPartNumber.trim()
    const match = rolls.find((r) => r.part_number === target) ?? rolls.find((r) => r.id === target)
    scanHandledRef.current = scanPartNumber
    if (match) {
      setDrawerRoll(match)
      setDrawerOpen(true)
    }
    onScanResolved?.()
  }, [scanPartNumber, rolls, loading, onScanResolved])

  // `refreshKey` is an imperative nudge from the parent page — the
  // hook already re-fetches when `searchQuery` changes, so we only
  // need to honour the key when it increases.
  void refreshKey

  const bustCache = async () => {
    await refresh()
    onMutated?.()
  }

  const openDrawer = (roll: Roll) => {
    setDrawerRoll(roll)
    setDrawerOpen(true)
  }

  const handleEdit = (roll: Roll) => {
    setEditingRoll(roll)
    setEditDialogOpen(true)
  }

  const handleRowAction = (action: InventoryRowAction) => {
    if (action.type === "edit") {
      handleEdit(action.roll)
      return
    }
    setPending(action)
  }

  const handleDelete = async (rollId: string) => {
    try {
      await rollsSdk.delete(rollId)
      toast.success("Roll deleted")
      await bustCache()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined
      toast.error("Failed to delete roll", { description: message })
    }
  }

  const handleDeplete = async (rollId: string) => {
    try {
      // Depletion = status "depleted" AND remaining_length 0 in one
      // call, because the Rust backend rejects status-only depletion
      // (INVALID_DEPLETION_STATE) and the legacy service also zeroed
      // remaining_length internally.
      await rollsSdk.update(rollId, { status: "depleted", remaining_length: 0 })
      toast.success("Roll marked depleted")
      await bustCache()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : undefined
      toast.error("Failed to update roll", { description: message })
    }
  }

  const confirmPending = async () => {
    if (!pending) return
    if (pending.type === "delete") await handleDelete(pending.rollId)
    else if (pending.type === "deplete") await handleDeplete(pending.rollId)
    setPending(null)
  }

  if (loading) {
    return (
      <div className="px-6 py-8 text-center text-muted-foreground text-sm">Loading inventory…</div>
    )
  }

  if (rolls.length === 0) {
    return (
      <EmptyState
        icon={<Package2 className="size-5" />}
        title="No rolls in inventory"
        description={
          canManageRolls
            ? "Add a roll with the button in the header, or drop a CSV file to bulk-import."
            : "Your inventory is empty."
        }
      />
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Part #</TableHead>
            <TableHead>Material</TableHead>
            <TableHead>Dimensions (W × L × T)</TableHead>
            <TableHead>Remaining</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Received</TableHead>
            {canManageRolls && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRolls.map((roll) => (
            <InventoryRow
              key={roll.id}
              roll={roll}
              isActive={roll.id === drawerRoll?.id}
              canManageRolls={canManageRolls}
              onOpen={openDrawer}
              onAction={handleRowAction}
            />
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-2 text-xs text-muted-foreground">
        <div className="tabular-nums">
          {totalRolls === 0
            ? "0 rolls"
            : `Showing ${pageStart + 1}–${pageEnd} of ${totalRolls} roll${totalRolls === 1 ? "" : "s"}`}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-7 w-[72px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="tabular-nums px-1">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <RollDetailDrawer
        roll={drawerRoll}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onEdit={handleEdit}
        canManageRolls={canManageRolls}
      />

      {canManageRolls && (
        <RollFormDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          roll={editingRoll}
          onSuccess={() => {
            setEditingRoll(null)
            void bustCache()
          }}
        />
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.type === "delete" ? "Delete this roll?" : "Mark roll as depleted?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === "delete"
                ? "This permanently removes the roll from inventory. Cut history records that reference it stay intact."
                : "Marks this roll as fully used. Remaining length is set to zero and it stops appearing in available-material checks."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPending}
              className={cn(
                pending?.type === "delete" && "bg-danger text-danger-foreground hover:bg-danger/90"
              )}
            >
              {pending?.type === "delete" ? "Delete roll" : "Mark depleted"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
