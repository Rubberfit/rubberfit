"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FileText, Plus, DollarSign, Truck, Clock, Download } from "lucide-react"
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
import type { MaterialType } from "@/src/infrastructure/models/supabase"

import { handleDownloadPDF } from "./_components/po-pdf-export"
import { POViewDialog } from "./_components/po-view-dialog"
import { POCreateDialog } from "./_components/po-create-dialog"
import { POEditDialog } from "./_components/po-edit-dialog"
import { POTable } from "./_components/po-table"
import { usePurchaseOrders } from "./_components/use-purchase-orders"
import { getEmptyItem, type POFormData } from "./_components/po-form-dialog"

/**
 * Reads the job-sufficiency deep-link query params and, when present,
 * pre-fills the PO create dialog with a matching line item + stores
 * the source job id so `handleCreatePO` can stamp it onto the PO.
 * One-shot — strips the params afterwards so a refresh doesn't
 * replay the prefill on top of an in-progress draft.
 */
function JobPrefillBridge({
  materialTypes,
  formData,
  setFormData,
  setIsCreateDialogOpen,
  setSourceJobId,
}: {
  materialTypes: MaterialType[]
  formData: POFormData
  setFormData: (data: POFormData) => void
  setIsCreateDialogOpen: (open: boolean) => void
  setSourceJobId: (id: string | null) => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const appliedRef = useRef(false)

  const jobIdParam = searchParams.get("job_id")
  const materialParam = searchParams.get("material")
  const shortfallParam = searchParams.get("shortfall_sqft")

  useEffect(() => {
    if (appliedRef.current || !jobIdParam) return
    // Wait for material types so the name → id lookup resolves.
    if (materialTypes.length === 0) return
    appliedRef.current = true

    const shortfall = Number(shortfallParam)
    const match = materialTypes.find(
      (mt) =>
        (materialParam ?? "").trim().toLowerCase() ===
        (mt.name ?? "").trim().toLowerCase()
    )

    setFormData({
      ...formData,
      items: [
        {
          ...getEmptyItem(),
          material_type_id: match?.id ?? "",
          description: materialParam ? `Job shortfall: ${materialParam}` : "",
          quantity_sqft:
            Number.isFinite(shortfall) && shortfall > 0
              ? Number(shortfall.toFixed(2))
              : 0,
        },
      ],
      notes: formData.notes,
    })
    setSourceJobId(jobIdParam)
    setIsCreateDialogOpen(true)
    toast.message("PO prefilled from job shortfall.", {
      description: materialParam
        ? `${materialParam} · ${shortfall.toFixed(1)} sqft`
        : undefined,
    })
    router.replace("/dashboard/inventory/purchase-orders")
  }, [
    jobIdParam,
    materialParam,
    shortfallParam,
    materialTypes,
    formData,
    setFormData,
    setIsCreateDialogOpen,
    setSourceJobId,
    router,
  ])

  return null
}

function PurchaseOrdersPageInner() {
  const po = usePurchaseOrders()
  // Set when the operator came from a job sufficiency panel's "Create
  // PO" deep-link. Flows into `handleCreatePO(sourceJobId)` so the
  // resulting PO stamps `purchase_orders.job_id` for the job drawer's
  // linked-POs panel to surface it. Cleared on submit / dialog close.
  const [sourceJobId, setSourceJobId] = useState<string | null>(null)

  const handleViewPO = async (poItem: Parameters<typeof po.fetchTaxDetailsForPO>[0]) => {
    po.setSelectedPO(poItem)
    await po.fetchTaxDetailsForPO(poItem)
    po.setIsViewDialogOpen(true)
  }

  const handleCancelPO = (poItem: Parameters<typeof po.fetchTaxDetailsForPO>[0]) => {
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

  const handleCreatePO = async () => {
    await po.handleCreatePO(sourceJobId ?? undefined)
    setSourceJobId(null)
  }

  return (
    <PageShell variant="dense">
      <JobPrefillBridge
        materialTypes={po.materialTypes}
        formData={po.formData}
        setFormData={po.setFormData}
        setIsCreateDialogOpen={po.setIsCreateDialogOpen}
        setSourceJobId={setSourceJobId}
      />

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
            <Button size="sm" variant="outline">
              <Download className="size-3.5" />
              Export
            </Button>
            <Button size="sm" onClick={() => po.setIsCreateDialogOpen(true)}>
              <Plus className="size-3.5" />
              New PO
            </Button>
          </>
        }
      />

      {sourceJobId && (
        <InlineNotice intent="info" title="Job shortfall PO">
          This draft will be linked to the originating job on submit.
        </InlineNotice>
      )}

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
          onEditPO={po.handleEditPO}
          onUpdatePOStatus={po.updatePOStatus}
          onCancelPO={handleCancelPO}
          fetchData={po.fetchData}
        />
      </Card>

      <POCreateDialog
        isOpen={po.isCreateDialogOpen}
        setIsOpen={(open) => {
          po.setIsCreateDialogOpen(open)
          if (!open) setSourceJobId(null)
        }}
        formData={po.formData}
        setFormData={po.setFormData}
        suppliers={po.suppliers}
        materialTypes={po.materialTypes}
        isCreating={po.isCreating}
        createFormTaxDetails={po.createFormTaxDetails}
        onCreatePO={handleCreatePO}
        onConfirmRemoveItem={po.handleConfirmRemoveItem}
      />

      <POViewDialog
        selectedPO={po.selectedPO}
        isViewDialogOpen={po.isViewDialogOpen}
        setIsViewDialogOpen={po.setIsViewDialogOpen}
        setSelectedPO={po.setSelectedPO}
        selectedPOTaxDetails={po.selectedPOTaxDetails}
        onEditPO={po.handleEditPO}
        onUpdatePOStatus={po.updatePOStatus}
        onDownloadPDF={handleDownloadPDF}
      />

      <POEditDialog
        isOpen={po.isEditDialogOpen}
        setIsOpen={po.setIsEditDialogOpen}
        editingPO={po.editingPO}
        setEditingPO={po.setEditingPO}
        editFormData={po.editFormData}
        setEditFormData={po.setEditFormData}
        suppliers={po.suppliers}
        materialTypes={po.materialTypes}
        isUpdating={po.isUpdating}
        editFormTaxDetails={po.editFormTaxDetails}
        onUpdatePO={po.handleUpdatePO}
        onConfirmRemoveItem={po.handleConfirmRemoveItem}
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

export default function PurchaseOrdersPage() {
  // `useSearchParams` requires a Suspense boundary in Next 16.
  return (
    <Suspense fallback={null}>
      <PurchaseOrdersPageInner />
    </Suspense>
  )
}
