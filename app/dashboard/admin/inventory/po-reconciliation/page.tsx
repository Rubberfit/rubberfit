import "reflect-metadata"
import "@/di/di-registration"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IPurchaseOrderService } from "@/src/application/services/purchase-order.service.interface"
import type { PoReceiptReconciliationRow } from "@/src/application/repositories/purchase-orders.repository.interface"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"
import { PageHeader, PageShell } from "@/app/components/patterns"

import {
  POReconciliationTable,
  type ReconciliationRowDto,
} from "./_components/po-reconciliation-table"

/**
 * Admin PO-receipt reconciliation dashboard (step 7c-2).
 *
 * Surfaces the two views that 7c-1 introduced:
 *   - `po_receipts_pending_apply` — receipts whose row landed but the
 *     PO `quantity_received_sqm` was never incremented
 *   - `po_receipts_pending_roll_creation` — applied receipts where the
 *     operator wanted a roll but `rollService.createRoll` never
 *     succeeded
 *
 * Per-row "Retry" buttons call the corresponding server actions; the
 * page revalidates on success so the row vanishes from the view.
 */
export default async function POReconciliationPage() {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "reconcileReceipts")

  const poService = container.resolve<IPurchaseOrderService>(TOKENS.IPurchaseOrderService)
  const [applyRows, rollRows] = await Promise.all([
    poService.findPendingApplyReceipts(),
    poService.findPendingRollCreationReceipts(),
  ])

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Inventory" },
          { label: "PO reconciliation" },
        ]}
        title="PO receipt reconciliation"
        subtitle="Pending apply: receipts whose PO update never landed. Pending roll creation: applied receipts whose roll never materialized. Retry to replay; idempotent on already-reconciled rows."
      />

      <POReconciliationTable
        applyRows={applyRows.map(toClientRow)}
        rollRows={rollRows.map(toClientRow)}
      />
    </PageShell>
  )
}

function toClientRow(row: PoReceiptReconciliationRow): ReconciliationRowDto {
  return {
    receiptId: row.receiptId,
    purchaseOrderItemId: row.purchaseOrderItemId,
    purchaseOrderId: row.purchaseOrderId,
    poNumber: row.poNumber,
    lineNumber: row.lineNumber,
    quantityReceivedSqm: row.quantityReceivedSqm,
    receivedDate: row.receivedDate.toISOString(),
    receiptCreatedAt: row.receiptCreatedAt.toISOString(),
    purchaseOrderStatus: row.purchaseOrderStatus,
  }
}
