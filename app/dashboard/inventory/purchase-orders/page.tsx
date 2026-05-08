"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { FileText, Plus, DollarSign, Truck, Clock } from "lucide-react"
import { toast } from "sonner"

import { Card } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { ConfirmationDialog } from "@/app/components/common/confirmation-dialog"
import {
  InlineNotice,
  PageHeader,
  PageShell,
  StatCard,
  StatusBadge,
} from "@/app/components/patterns"
import { purchaseOrders as purchaseOrdersSdk } from "@/src/infrastructure/api-client/rf/procurement"
import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

import { handleDownloadPDF } from "./_components/po-pdf-export"
import { PoViewDrawer, type PoDrawerMode } from "./_components/po-view-drawer"
import { POTable } from "./_components/po-table"
import { PurchaseOrdersExportMenu } from "./_components/po-export-menu"
import { toPurchaseOrdersExportInput } from "./_components/po-export-utils"
import { usePurchaseOrders } from "./_components/use-purchase-orders"

export default function PurchaseOrdersPage() {
  const po = usePurchaseOrders()
  const [drawerMode, setDrawerMode] = useState<PoDrawerMode>("view")

  const handleViewPO = async (poItem: PurchaseOrderWithDetails) => {
    po.setSelectedPO(poItem)
    setDrawerMode("view")
    await po.fetchTaxDetailsForPO(poItem)
    po.setIsViewDialogOpen(true)
  }

  /**
   * ARC-206: Edit lives in the drawer, not on a page. Clicking
   * Edit (row dropdown OR drawer body) opens the right-side drawer
   * in edit mode against the same PO. The `/[id]/edit` page route
   * is still mounted as a deep-linkable target, but no in-app
   * button navigates to it anymore.
   */
  const handleEditPO = async (poItem: PurchaseOrderWithDetails) => {
    po.setSelectedPO(poItem)
    setDrawerMode("edit")
    // Pre-fetch tax so the edit body's order summary doesn't flash
    // empty on first paint — the form has its own recalc effect,
    // but seeding from the parent avoids a visible "—" flicker.
    await po.fetchTaxDetailsForPO(poItem)
    po.setIsViewDialogOpen(true)
  }

  const handleSavedFromDrawer = async () => {
    po.setIsViewDialogOpen(false)
    setDrawerMode("view")
    po.setSelectedPO(null)
    await po.fetchData()
  }

  const handleCancelPO = (poItem: PurchaseOrderWithDetails) => {
    po.setConfirmAction({
      open: true,
      action: async () => {
        try {
          const result = await purchaseOrdersSdk.updateStatus(poItem.id, {
            status: "cancelled",
          })
          if (result) {
            toast.success("Purchase order cancelled")
            po.fetchData()
          } else {
            toast.error("Failed to cancel purchase order")
          }
        } catch (error) {
          const err = error as Error & { code?: string }
          console.error("Error canceling PO:", error)
          if (err.code === "INVALID_STATE_TRANSITION") {
            toast.error("This purchase order can't be cancelled from its current state.")
            return
          }
          toast.error("Failed to cancel purchase order")
        }
      },
      title: "Cancel Purchase Order?",
      description: `Are you sure you want to cancel PO #${poItem.po_number}? This action cannot be undone.`,
      variant: "danger",
    })
  }

  const exportInput = useMemo(
    () =>
      toPurchaseOrdersExportInput({
        filteredPOs: po.filteredPOs,
        statusFilter: po.statusFilter,
        supplierFilter: po.supplierFilter,
        searchQuery: po.searchQuery,
        stats: po.stats,
      }),
    [po.filteredPOs, po.statusFilter, po.supplierFilter, po.searchQuery, po.stats]
  )

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Purchase Orders" },
        ]}
        title="Purchase Orders"
        subtitle="Manage purchase orders, track deliveries, and handle approvals."
        actions={
          <>
            <PurchaseOrdersExportMenu input={exportInput} disabled={po.loading} />
            <Button asChild size="sm">
              <Link href="/dashboard/inventory/purchase-orders/new">
                <Plus className="size-3.5" />
                New PO
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total POs"
          icon={<FileText />}
          value={po.stats.total}
          footnote={
            <span className="flex flex-wrap gap-1.5">
              <StatusBadge intent="neutral" variant="outline">
                {po.stats.draft} draft
              </StatusBadge>
              <StatusBadge intent="warning" variant="outline">
                {po.stats.pending} pending
              </StatusBadge>
            </span>
          }
        />
        <StatCard
          label="Total value"
          icon={<DollarSign />}
          value={`$${po.stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
          footnote="Across all orders"
        />
        <StatCard
          label="In transit"
          icon={<Truck />}
          value={po.stats.ordered}
          footnote="Awaiting delivery"
          sparkIntent="accent"
        />
        <StatCard
          label="Avg lead time"
          icon={<Clock />}
          value={po.stats.avgLeadTime}
          unit="d"
          footnote="Order to delivery"
        />
      </div>

      {po.stats.pending > 0 && (
        <InlineNotice intent="warning" title="Pending approvals">
          {po.stats.pending} purchase order{po.stats.pending === 1 ? "" : "s"} awaiting approval.
        </InlineNotice>
      )}

      <Card className="overflow-hidden p-0">
        <POTable
          loading={po.loading}
          filteredPOs={po.filteredPOs}
          suppliers={po.suppliers}
          statusFilter={po.statusFilter}
          setStatusFilter={po.setStatusFilter}
          supplierFilter={po.supplierFilter}
          setSupplierFilter={po.setSupplierFilter}
          searchQuery={po.searchQuery}
          setSearchQuery={po.setSearchQuery}
          onViewPO={handleViewPO}
          onEditPO={handleEditPO}
          onUpdatePOStatus={po.updatePOStatus}
          onCancelPO={handleCancelPO}
          fetchData={po.fetchData}
        />
      </Card>

      <PoViewDrawer
        po={po.selectedPO}
        open={po.isViewDialogOpen}
        onOpenChange={(open) => {
          po.setIsViewDialogOpen(open)
          if (!open) {
            po.setSelectedPO(null)
            // Reset to view mode so the next time the drawer opens
            // (e.g., a different PO viewed from the row), it starts
            // in read-only view, not in lingering edit mode.
            setDrawerMode("view")
          }
        }}
        mode={drawerMode}
        onModeChange={setDrawerMode}
        taxDetails={po.selectedPOTaxDetails}
        suppliers={po.suppliers}
        materialTypes={po.materialTypes}
        onSaved={handleSavedFromDrawer}
        onUpdateStatus={po.updatePOStatus}
        onDownloadPDF={handleDownloadPDF}
      />

      <ConfirmationDialog
        open={po.confirmAction.open}
        onOpenChange={(open) => po.setConfirmAction({ ...po.confirmAction, open })}
        onConfirm={po.confirmAction.action}
        title={po.confirmAction.title}
        description={po.confirmAction.description}
        variant={po.confirmAction.variant}
      />
    </PageShell>
  )
}
