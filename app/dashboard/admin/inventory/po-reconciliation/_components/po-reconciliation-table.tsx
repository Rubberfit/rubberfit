"use client"

import * as React from "react"
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
        onRetry={onRetryPendingApply}
      />
      <ReconciliationSection
        title="Pending roll creation"
        description="Applied receipts where the operator requested a roll but rollService.createRoll never succeeded (or its stamp never persisted)."
        rows={rollRows}
        onRetry={onRetryPendingRollCreation}
      />
    </div>
  )
}

interface ReconciliationSectionProps {
  title: string
  description: string
  rows: ReadonlyArray<ReconciliationRowDto>
  onRetry: (receiptId: string) => Promise<void>
}

function ReconciliationSection({ title, description, rows, onRetry }: ReconciliationSectionProps) {
  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const handleRetry = React.useCallback(
    async (receiptId: string) => {
      setPendingId(receiptId)
      try {
        await onRetry(receiptId)
      } finally {
        setPendingId(null)
      }
    },
    [onRetry]
  )

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
      cell: (row) => <span className="text-xs uppercase tracking-wide">{row.purchaseOrderStatus}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleRetry(row.receiptId)}
          disabled={pendingId !== null}
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

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
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

async function onRetryPendingApply(receiptId: string): Promise<void> {
  try {
    const result = await reconcilePendingApply({ receiptId })
    if (result.alreadyApplied) {
      toast.info("Already reconciled", {
        description: "The receipt was already applied — nothing to do.",
      })
    } else {
      toast.success("Receipt re-applied", {
        description: `PO ${result.purchaseOrder.poNumber} is now in '${result.purchaseOrder.status}'.`,
      })
    }
  } catch (error) {
    toast.error("Reconcile failed", {
      description: (error as Error).message,
    })
  }
}

async function onRetryPendingRollCreation(receiptId: string): Promise<void> {
  try {
    const outcome = await reconcilePendingRollCreation({ receiptId })
    const label = outcome.kind === "created" ? "Roll created" : "Already reconciled"
    const description =
      outcome.kind === "created"
        ? `New roll ${outcome.roll.id.value} added to inventory.`
        : outcome.kind === "already-exists"
          ? "A roll already existed; stamp synced."
          : "Receipt was already stamped — nothing to do."
    if (outcome.kind === "created") {
      toast.success(label, { description })
    } else {
      toast.info(label, { description })
    }
  } catch (error) {
    toast.error("Reconcile failed", {
      description: (error as Error).message,
    })
  }
}
