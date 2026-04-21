"use client"

import {
  Edit2,
  Send,
  Clock,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Download,
  ClipboardCheck,
  Building2,
} from "lucide-react"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/entities"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Separator } from "@/app/components/ui/separator"
import { toast } from "sonner"
import { type TaxDetails } from "./po-tax-helpers"
import {
  OrderDetailsCard,
  SupplierContactCard,
  LineItemsCard,
  AddressesCard,
  OrderSummaryCard,
  NotesCard,
} from "./po-view-sections"

export function getStatusBadge(status: string) {
  const config = {
    draft: { variant: "secondary" as const, icon: <Edit2 className="h-3 w-3" /> },
    pending: { variant: "warning" as const, icon: <Clock className="h-3 w-3" /> },
    approved: { variant: "default" as const, icon: <CheckCircle className="h-3 w-3" /> },
    ordered: { variant: "outline" as const, icon: <Truck className="h-3 w-3" /> },
    received: { variant: "success" as const, icon: <Package className="h-3 w-3" /> },
    cancelled: { variant: "destructive" as const, icon: <XCircle className="h-3 w-3" /> },
  }

  const cfg = config[status as keyof typeof config] || config.draft

  return (
    <Badge variant={cfg.variant} className="gap-1">
      {cfg.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

interface POViewDialogProps {
  selectedPO: PurchaseOrderWithDetails | null
  isViewDialogOpen: boolean
  setIsViewDialogOpen: (open: boolean) => void
  setSelectedPO: (po: PurchaseOrderWithDetails | null) => void
  selectedPOTaxDetails: TaxDetails | null
  onEditPO: (po: PurchaseOrderWithDetails) => void
  onUpdatePOStatus: (poId: string, newStatus: PurchaseOrder["status"]) => Promise<void>
  onDownloadPDF: (po: PurchaseOrderWithDetails) => void
}

export function POViewDialog({
  selectedPO,
  isViewDialogOpen,
  setIsViewDialogOpen,
  setSelectedPO,
  selectedPOTaxDetails,
  onEditPO,
  onUpdatePOStatus,
  onDownloadPDF,
}: POViewDialogProps) {
  if (!selectedPO) return null

  return (
    <Dialog
      open={isViewDialogOpen}
      onOpenChange={(open) => {
        setIsViewDialogOpen(open)
        if (!open) {
          setSelectedPO(null)
        }
      }}
    >
      <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <DialogTitle className="text-2xl font-bold tracking-tight">
                PO #{selectedPO.po_number}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-gray-400" />
                <span className="font-medium text-[#111827]">{selectedPO.supplier?.name}</span>
                {selectedPO.supplier?.city && selectedPO.supplier?.state && (
                  <span className="text-gray-500">
                    -- {selectedPO.supplier.city}, {selectedPO.supplier.state}
                  </span>
                )}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getStatusBadge(selectedPO.status)}
              {selectedPO.auto_generated && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <ClipboardCheck className="h-3 w-3" />
                  Auto-generated
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="flex-1 overflow-y-auto px-1 -mx-1">
          <div className="space-y-5 pb-4 pt-2">
            <OrderDetailsCard selectedPO={selectedPO} />
            <SupplierContactCard selectedPO={selectedPO} />
            <LineItemsCard selectedPO={selectedPO} />
            <AddressesCard selectedPO={selectedPO} />
            <OrderSummaryCard selectedPO={selectedPO} selectedPOTaxDetails={selectedPOTaxDetails} />
            {selectedPO.notes && <NotesCard notes={selectedPO.notes} />}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4 mt-0">
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => {
                setIsViewDialogOpen(false)
                setSelectedPO(null)
              }}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
            {selectedPO.status === "draft" && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsViewDialogOpen(false)
                    onEditPO(selectedPO)
                  }}
                  className="w-full sm:w-auto"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  onClick={async () => {
                    await onUpdatePOStatus(selectedPO.id, "pending")
                    setIsViewDialogOpen(false)
                    toast.success("Purchase order submitted for approval")
                  }}
                  className="w-full sm:w-auto"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Submit
                </Button>
              </>
            )}
            <Button className="w-full sm:w-auto" onClick={() => onDownloadPDF(selectedPO)}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
