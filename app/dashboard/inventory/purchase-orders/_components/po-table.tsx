"use client"

import {
  Edit2,
  Eye,
  Send,
  CheckCircle,
  XCircle,
  Truck,
  Calendar,
  Building2,
  Download,
  Search,
  MoreVertical,
  Mail,
  ClipboardCheck,
} from "lucide-react"
import { format } from "date-fns"

import {
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import { getStatusBadge } from "./po-view-dialog"
import { handleDownloadPDF } from "./po-pdf-export"

interface POTableProps {
  loading: boolean
  filteredPOs: PurchaseOrderWithDetails[]
  suppliers: Supplier[]
  statusFilter: string
  setStatusFilter: (v: string) => void
  supplierFilter: string
  setSupplierFilter: (v: string) => void
  searchQuery: string
  setSearchQuery: (v: string) => void
  onViewPO: (po: PurchaseOrderWithDetails) => void
  onEditPO: (po: PurchaseOrderWithDetails) => void
  onUpdatePOStatus: (poId: string, newStatus: PurchaseOrder["status"]) => Promise<void>
  onCancelPO: (po: PurchaseOrderWithDetails) => void
  fetchData: () => void
}

export function POTable({
  loading,
  filteredPOs,
  suppliers,
  statusFilter,
  setStatusFilter,
  supplierFilter,
  setSupplierFilter,
  searchQuery,
  setSearchQuery,
  onViewPO,
  onEditPO,
  onUpdatePOStatus,
  onCancelPO,
}: POTableProps) {
  return (
    <>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search PO number, supplier, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="ordered">Ordered</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Suppliers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Purchase Orders Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>PO Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Order Date</TableHead>
              <TableHead>Delivery Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  Loading purchase orders...
                </TableCell>
              </TableRow>
            ) : filteredPOs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  No purchase orders found
                </TableCell>
              </TableRow>
            ) : (
              filteredPOs.map((po) => (
                <POTableRow
                  key={po.id}
                  po={po}
                  onViewPO={onViewPO}
                  onEditPO={onEditPO}
                  onUpdatePOStatus={onUpdatePOStatus}
                  onCancelPO={onCancelPO}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function POTableRow({
  po,
  onViewPO,
  onEditPO,
  onUpdatePOStatus,
  onCancelPO,
}: {
  po: PurchaseOrderWithDetails
  onViewPO: (po: PurchaseOrderWithDetails) => void
  onEditPO: (po: PurchaseOrderWithDetails) => void
  onUpdatePOStatus: (poId: string, newStatus: PurchaseOrder["status"]) => Promise<void>
  onCancelPO: (po: PurchaseOrderWithDetails) => void
}) {
  return (
    <TableRow id={`po-row-${po.id}`} className="transition-colors duration-300">
      <TableCell className="font-medium">{po.po_number}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {po.supplier?.name || "Unknown"}
        </div>
      </TableCell>
      <TableCell>{getStatusBadge(po.status)}</TableCell>
      <TableCell>
        {po.order_date ? format(new Date(po.order_date), "MMM dd, yyyy") : "\u2014"}
      </TableCell>
      <TableCell>
        {po.requested_delivery_date ? (
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            {format(new Date(po.requested_delivery_date), "MMM dd")}
          </div>
        ) : (
          "\u2014"
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{po.items?.length || 0} items</Badge>
      </TableCell>
      <TableCell>
        <span className="font-mono font-semibold">
          ${po.total_amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </span>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="min-h-[44px] min-w-[44px]">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onViewPO(po)}>
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {po.status === "draft" && (
              <>
                <DropdownMenuItem onClick={() => onEditPO(po)}>
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onUpdatePOStatus(po.id, "pending")}>
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Approval
                </DropdownMenuItem>
              </>
            )}
            {po.status === "pending" && (
              <DropdownMenuItem onClick={() => onUpdatePOStatus(po.id, "approved")}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </DropdownMenuItem>
            )}
            {po.status === "approved" && (
              <DropdownMenuItem onClick={() => onUpdatePOStatus(po.id, "ordered")}>
                <Truck className="h-4 w-4 mr-2" />
                Mark as Ordered
              </DropdownMenuItem>
            )}
            {po.status === "ordered" && (
              <DropdownMenuItem onClick={() => onUpdatePOStatus(po.id, "received")}>
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Receive Goods
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleDownloadPDF(po)}>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Mail className="h-4 w-4 mr-2" />
              Email to Supplier
            </DropdownMenuItem>
            {po.status === "draft" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={() => onCancelPO(po)}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancel
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}
