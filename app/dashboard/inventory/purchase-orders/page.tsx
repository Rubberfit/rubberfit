"use client"

import { FileText, Plus, DollarSign, Truck, Clock, AlertCircle, Download } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ConfirmationDialog } from "@/components/common/confirmation-dialog"
import { purchaseOrderService } from "@/services/purchaseOrderService"
import { toast } from "sonner"

import { handleDownloadPDF } from "./_components/po-pdf-export"
import { POViewDialog } from "./_components/po-view-dialog"
import { POCreateDialog } from "./_components/po-create-dialog"
import { POEditDialog } from "./_components/po-edit-dialog"
import { POTable } from "./_components/po-table"
import { usePurchaseOrders } from "./_components/use-purchase-orders"

export default function PurchaseOrdersPage() {
  const po = usePurchaseOrders()

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
          const result = await purchaseOrderService.updatePurchaseOrderStatus(
            poItem.id,
            "cancelled"
          )
          if (result) {
            toast.success("Purchase order cancelled")
            po.fetchData()
          } else {
            toast.error("Failed to cancel purchase order")
          }
        } catch (error) {
          console.error("Error canceling PO:", error)
          toast.error("Failed to cancel purchase order")
        }
      },
      title: "Cancel Purchase Order?",
      description: `Are you sure you want to cancel PO #${poItem.po_number}? This action cannot be undone.`,
      variant: "danger",
    })
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted-foreground">Manage purchase orders and track deliveries</p>
        </div>
        <Button onClick={() => po.setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Purchase Order
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total POs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{po.stats.total}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary">{po.stats.draft} draft</Badge>
              <Badge variant="warning">{po.stats.pending} pending</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${po.stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <p className="text-xs text-muted-foreground">Across all orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Transit</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{po.stats.ordered}</div>
            <p className="text-xs text-muted-foreground">Awaiting delivery</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{po.stats.avgLeadTime} days</div>
            <p className="text-xs text-muted-foreground">From order to delivery</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approvals Alert */}
      {po.stats.pending > 0 && (
        <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Pending Approvals</AlertTitle>
          <AlertDescription>
            {po.stats.pending} purchase order(s) are awaiting approval.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Purchase Orders</CardTitle>
              <CardDescription>View and manage all purchase orders</CardDescription>
            </div>
            <Button variant="outline" className="min-h-[44px]">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Create PO Dialog */}
      <POCreateDialog
        isOpen={po.isCreateDialogOpen}
        setIsOpen={po.setIsCreateDialogOpen}
        formData={po.formData}
        setFormData={po.setFormData}
        suppliers={po.suppliers}
        materialTypes={po.materialTypes}
        isCreating={po.isCreating}
        createFormTaxDetails={po.createFormTaxDetails}
        onCreatePO={po.handleCreatePO}
        onConfirmRemoveItem={po.handleConfirmRemoveItem}
      />

      {/* View PO Dialog */}
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

      {/* Edit PO Dialog */}
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

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        open={po.confirmAction.open}
        onOpenChange={(open) => po.setConfirmAction({ ...po.confirmAction, open })}
        onConfirm={po.confirmAction.action}
        title={po.confirmAction.title}
        description={po.confirmAction.description}
        variant={po.confirmAction.variant}
      />
    </div>
  )
}
