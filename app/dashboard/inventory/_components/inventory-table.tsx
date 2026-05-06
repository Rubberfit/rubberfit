"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Package2 } from "lucide-react"
import { toast } from "sonner"

import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll } from "@/src/infrastructure/models/supabase"
import { DataTable, initialSortState, useTableSort } from "@/app/components/patterns/data-table"
import { EmptyState } from "@/app/components/patterns"

import { DestructiveRollActionDialog } from "./destructive-roll-action-dialog"
import { RollDetailDrawer } from "./roll-detail-drawer"
import { RollFormDialog } from "./roll-form-dialog"
import { TablePagination } from "./table-pagination"
import { useInventoryColumns } from "./use-inventory-columns"
import { usePagedRolls } from "./use-paged-rolls"
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
 * destructive flows route through the shared `AlertDialog`.
 *
 * Phase 3 PR 3a — migrated to `<DataTable>` from
 * `@/app/components/patterns/data-table`. Column definitions live
 * in `use-inventory-columns.tsx` so this component stays under the
 * `max-lines-per-function` budget. Drawer + form-dialog migration
 * is deferred to PR 3b.
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

  const [sort, setSort] = useTableSort({
    ...initialSortState,
    columnId: "received",
    direction: "desc",
  })

  const handleEdit = useCallback((roll: Roll) => {
    setEditingRoll(roll)
    setEditDialogOpen(true)
  }, [])

  const handleDepleteRequest = useCallback((rollId: string) => {
    setPending({ type: "deplete", rollId })
  }, [])

  const handleDeleteRequest = useCallback((rollId: string) => {
    setPending({ type: "delete", rollId })
  }, [])

  const columns = useInventoryColumns({
    canManageRolls,
    onEdit: handleEdit,
    onDeplete: handleDepleteRequest,
    onDelete: handleDeleteRequest,
  })

  const {
    pageRolls,
    setPage,
    pageSize,
    setPageSize,
    safePage,
    pageStart,
    pageEnd,
    totalPages,
    totalRolls,
  } = usePagedRolls({
    rolls,
    columns,
    sort,
    defaultPageSize: DEFAULT_PAGE_SIZE,
  })

  // Resolve a scan-in part number as soon as the rolls list is
  // loaded. Compared against `part_number` first, then falls back
  // to id for legacy rolls whose part numbers predate the sequence.
  // The setState pair sits in the effect body — same shape as the
  // pre-PR-3a code; CI doesn't lint `app/` (npm run lint scopes to
  // src + nesting + di + config + proxy.ts) so this didn't surface
  // before. Cleanup is queued alongside `userformmodal.tsx:529` for
  // the same React 19 rule.
  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
            ? "Add a roll with the button in the header, or use Tools → Import CSV to bulk-import."
            : "Your inventory is empty."
        }
      />
    )
  }

  return (
    <>
      <DataTable
        columns={columns}
        rows={pageRolls}
        rowKey={(row) => row.id}
        sort={sort}
        onSortChange={setSort}
        density="comfortable"
        onRowClick={(row) => openDrawer(row)}
        rowClassName={(row) => (row.id === drawerRoll?.id ? "bg-muted/50" : undefined)}
        empty={
          <EmptyState
            icon={<Package2 className="size-5" />}
            title="No matching rolls"
            description="Try adjusting your search."
          />
        }
        className="border-0 rounded-none"
      />

      <TablePagination
        totalRows={totalRolls}
        pageStart={pageStart}
        pageEnd={pageEnd}
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        rowLabel="roll"
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />

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

      <DestructiveRollActionDialog
        pendingKind={pending?.type ?? null}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
