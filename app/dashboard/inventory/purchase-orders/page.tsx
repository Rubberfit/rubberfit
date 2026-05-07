"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { PoViewDrawer } from "./_components/po-view-drawer"
import { POTable } from "./_components/po-table"
import { PurchaseOrdersExportMenu } from "./_components/po-export-menu"
import { toPurchaseOrdersExportInput } from "./_components/po-export-utils"
import { usePurchaseOrders } from "./_components/use-purchase-orders"

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const po = usePurchaseOrders()

  const handleViewPO = async (poItem: PurchaseOrderWithDetails) => {
    po.setSelectedPO(poItem)
    await po.fetchTaxDetailsForPO(poItem)
    po.setIsViewDialogOpen(true)
  }

  const handleEditPO = (poItem: PurchaseOrderWithDetails) => {
    router.push(`/dashboard/inventory/purchase-orders/${poItem.id}/edit`)
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
          if (!open) po.setSelectedPO(null)
        }}
        taxDetails={po.selectedPOTaxDetails}
        onEdit={handleEditPO}
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
