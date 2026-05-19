"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { DataTable, EmptyState, type ColumnDef } from "@/app/components/patterns"
import type { PoStatus } from "@/src/entities/value-objects/po-status"
import {
  reconcilePendingApply,
  reconcilePendingRollCreation,
} from "@/app/actions/po-reconciliation"

/**
 * Client-shape DTO for the reconciliation tables. The server page
 * serializes Date objects to ISO strings before crossing the RSC
 * boundary, so this type uses `string` for dates.
 */
export interface ReconciliationRowDto {
  receiptId: string
  purchaseOrderItemId: string
  purchaseOrderId: string
  poNumber: string
  lineNumber: number
  quantityReceivedSqm: number
  receivedDate: string
  receiptCreatedAt: string
  purchaseOrderStatus: PoStatus
}

interface POReconciliationTableProps {
  applyRows: ReadonlyArray<ReconciliationRowDto>
  rollRows: ReadonlyArray<ReconciliationRowDto>
}

export function POReconciliationTable({ applyRows, rollRows }: POReconciliationTableProps) {
  return (
    <div className="flex flex-col gap-8">
      <ReconciliationSection
        title="Pending PO apply"
        description="Receipt rows where the INSERT committed but the PO quantity_received_sqm update never landed. Retry re-applies on the entity."
        rows={applyRows}
        retryRow={retryPendingApplyRow}
        bulkConfirmMessage="Retry all pending PO apply receipts? Already-reconciled rows are no-ops."
        bulkLabel="Retry all pending apply"
      />
      <ReconciliationSection
        title="Pending roll creation"
        description="Applied receipts where the operator requested a roll but rollService.createRoll never succeeded (or its stamp never persisted)."
        rows={rollRows}
        retryRow={retryPendingRollCreationRow}
        bulkConfirmMessage="Retry all pending roll-creation receipts? Already-reconciled rows are no-ops."
        bulkLabel="Retry all pending roll creation"
      />
    </div>
  )
}

/**
 * Result shape returned by a single per-row retry call. The section
 * uses this to surface per-row toasts AND to feed the bulk summary.
 */
type RetryOutcome =
  | { status: "success"; message?: string }
  | { status: "info"; message?: string }
  | { status: "failure"; error: Error }

interface ReconciliationSectionProps {
  title: string
  description: string
  rows: ReadonlyArray<ReconciliationRowDto>
  /**
   * Per-row retry executor. Returns a `RetryOutcome` describing how the
   * call resolved so the section can render the per-row toast AND
   * aggregate a bulk summary. Never throws.
   */
  retryRow: (receiptId: string) => Promise<RetryOutcome>
  bulkConfirmMessage: string
  bulkLabel: string
}

function ReconciliationSection({
  title,
  description,
  rows,
  retryRow,
  bulkConfirmMessage,
  bulkLabel,
}: ReconciliationSectionProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = React.useState<{ done: number; total: number } | null>(
    null
  )
  const isBulkRunning = bulkProgress !== null
  const isAnyPending = pendingId !== null || isBulkRunning
  const hasRows = rows.length > 0

  /**
   * Shared retry entrypoint: calls `retryRow`, surfaces a per-row toast
   * for the outcome, and returns the outcome for callers (the bulk loop)
   * that want to aggregate results.
   */
  const runRetry = React.useCallback(
    async (receiptId: string): Promise<RetryOutcome> => {
      const outcome = await retryRow(receiptId)
      if (outcome.status === "success") {
        toast.success("Receipt re-applied", { description: outcome.message })
      } else if (outcome.status === "info") {
        toast.info("Already reconciled", { description: outcome.message })
      } else {
        toast.error("Reconcile failed", { description: outcome.error.message })
      }
      return outcome
    },
    [retryRow]
  )

  const handleRowRetry = React.useCallback(
    async (receiptId: string) => {
      setPendingId(receiptId)
      try {
        await runRetry(receiptId)
      } finally {
        setPendingId(null)
      }
    },
    [runRetry]
  )

  const handleBulkRetry = React.useCallback(async () => {
    if (rows.length === 0) {
      return
    }
    if (!window.confirm(bulkConfirmMessage)) {
      return
    }

    const ids = rows.map((row) => row.receiptId)
    const total = ids.length
    setBulkProgress({ done: 0, total })

    const failures: { receiptId: string; error: Error }[] = []
    let successes = 0
    let alreadyReconciled = 0

    for (let i = 0; i < ids.length; i += 1) {
      const receiptId = ids[i]
      if (receiptId === undefined) {
        continue
      }
      // Sequential so server cache invalidations don't stack up
      // mid-flight and the operator sees consistent toast ordering.
      const outcome = await runRetry(receiptId)
      if (outcome.status === "success") {
        successes += 1
      } else if (outcome.status === "info") {
        alreadyReconciled += 1
      } else {
        failures.push({ receiptId, error: outcome.error })
      }
      setBulkProgress({ done: i + 1, total })
    }

    setBulkProgress(null)

    const summaryParts = [
      `${successes} reconciled`,
      alreadyReconciled > 0 ? `${alreadyReconciled} already done` : null,
      failures.length > 0 ? `${failures.length} failed` : null,
    ].filter((part): part is string => part !== null)
    const summary = summaryParts.join(", ")

    if (failures.length > 0) {
      const failureIds = failures.map((f) => f.receiptId)
      console.error("[po-reconciliation] bulk retry failures", failures)
      toast.error(summary, {
        description: `Failed receipt ids: ${failureIds.join(", ")}. Check console for error detail.`,
      })
    } else {
      toast.success(summary, {
        description: "Refreshing the dashboard to reflect cleared rows.",
      })
    }

    // The action's revalidatePath already refreshes the route's cache;
    // an explicit router.refresh() forces the RSC re-fetch so cleared
    // rows disappear without a hard reload.
    router.refresh()
  }, [rows, bulkConfirmMessage, runRetry, router])

  const columns: ColumnDef<ReconciliationRowDto>[] = [
    {
      id: "po-number",
      header: "PO",
      cell: (row) => <span className="font-mono text-xs">{row.poNumber}</span>,
      sortFn: (row) => row.poNumber,
    },
    {
      id: "line",
      header: "Line",
      cell: (row) => row.lineNumber,
      sortFn: (row) => row.lineNumber,
      align: "right",
      className: "w-16",
    },
    {
      id: "qty",
      header: "Quantity (sqm)",
      cell: (row) => row.quantityReceivedSqm.toFixed(3),
      sortFn: (row) => row.quantityReceivedSqm,
      align: "right",
    },
    {
      id: "received",
      header: "Received",
      cell: (row) => new Date(row.receivedDate).toLocaleDateString(),
      sortFn: (row) => row.receivedDate,
    },
    {
      id: "created",
      header: "Receipt logged",
      cell: (row) => new Date(row.receiptCreatedAt).toLocaleString(),
      sortFn: (row) => row.receiptCreatedAt,
      defaultSort: "desc",
    },
    {
      id: "status",
      header: "PO status",
      cell: (row) => (
        <span className="text-xs uppercase tracking-wide">{row.purchaseOrderStatus}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRowRetry(row.receiptId)}
          disabled={isAnyPending}
          aria-label={`Retry receipt ${row.receiptId}`}
        >
          <RefreshCw
            className={pendingId === row.receiptId ? "size-3.5 animate-spin" : "size-3.5"}
            aria-hidden="true"
          />
          Retry
        </Button>
      ),
      className: "w-32",
      align: "right",
    },
  ]

  const bulkButtonLabel = isBulkRunning
    ? `Retrying ${bulkProgress.done}/${bulkProgress.total}…`
    : bulkLabel

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="flex items-center justify-end">
        <Button
          variant="default"
          size="sm"
          onClick={handleBulkRetry}
          disabled={!hasRows || isAnyPending}
          aria-label={bulkLabel}
        >
          <RefreshCw
            className={isBulkRunning ? "size-3.5 animate-spin" : "size-3.5"}
            aria-hidden="true"
          />
          {bulkButtonLabel}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to reconcile"
          description="No rows in this view. Receipts that hit a partial-state window will surface here for retry."
        />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.receiptId}
          density="compact"
        />
      )}
    </section>
  )
}

async function retryPendingApplyRow(receiptId: string): Promise<RetryOutcome> {
  try {
    const result = await reconcilePendingApply({ receiptId })
    if (result.alreadyApplied) {
      return {
        status: "info",
        message: "The receipt was already applied — nothing to do.",
      }
    }
    return {
      status: "success",
      message: `PO ${result.purchaseOrder.poNumber} is now in '${result.purchaseOrder.status}'.`,
    }
  } catch (error) {
    return { status: "failure", error: error as Error }
  }
}

async function retryPendingRollCreationRow(receiptId: string): Promise<RetryOutcome> {
  try {
    const outcome = await reconcilePendingRollCreation({ receiptId })
    if (outcome.kind === "created") {
      return {
        status: "success",
        message: `New roll ${outcome.roll.id.value} added to inventory.`,
      }
    }
    if (outcome.kind === "already-exists") {
      return {
        status: "info",
        message: "A roll already existed; stamp synced.",
      }
    }
    return {
      status: "info",
      message: "Receipt was already stamped — nothing to do.",
    }
  } catch (error) {
    return { status: "failure", error: error as Error }
  }
}
