"use client"

import {
  FileText,
  CheckCircle,
  Package,
  Truck,
  DollarSign,
  Calendar,
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
} from "lucide-react"

import { useUserPreferences } from "@/app/dashboard/_components/user-preferences-provider"
import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { Label } from "@/app/components/ui/label"
import { Separator } from "@/app/components/ui/separator"
import { formatUserDate, formatUserDateTime } from "@/src/application/preferences/user-date-format"
import { taxService } from "@/src/infrastructure/services/taxService"
import { type TaxDetails } from "./po-tax-helpers"
import { getStatusBadge } from "./po-status-badge"

interface OrderDetailsCardProps {
  selectedPO: PurchaseOrderWithDetails
}

export function OrderDetailsCard({ selectedPO }: OrderDetailsCardProps) {
  const preferences = useUserPreferences()
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Order Details
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Order Date</Label>
            <p className="text-sm font-medium">
              {selectedPO.order_date ? formatUserDate(selectedPO.order_date, preferences) : "--"}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Requested Delivery</Label>
            <p className="text-sm font-medium">
              {selectedPO.requested_delivery_date
                ? formatUserDate(selectedPO.requested_delivery_date, preferences)
                : "--"}
            </p>
          </div>
          {selectedPO.actual_delivery_date && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Actual Delivery</Label>
              <p className="text-sm font-medium text-[#16A34A]">
                {formatUserDate(selectedPO.actual_delivery_date, preferences)}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Payment Terms</Label>
            <p className="text-sm font-medium">{selectedPO.payment_terms || "--"}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div>{getStatusBadge(selectedPO.status)}</div>
          </div>
        </div>

        {selectedPO.approved_by && (
          <>
            <Separator className="my-4" />
            <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle className="h-5 w-5 text-[#16A34A] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#111827]">
                  Approved by {selectedPO.approved_by}
                </p>
                {selectedPO.approved_at && (
                  <p className="text-xs text-muted-foreground">
                    {formatUserDateTime(selectedPO.approved_at, preferences)}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface SupplierContactCardProps {
  selectedPO: PurchaseOrderWithDetails
}

export function SupplierContactCard({ selectedPO }: SupplierContactCardProps) {
  if (
    !selectedPO.supplier?.contact_person &&
    !selectedPO.supplier?.email &&
    !selectedPO.supplier?.phone &&
    !selectedPO.supplier?.address
  ) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Supplier Contact
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {selectedPO.supplier?.contact_person && (
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">{selectedPO.supplier.contact_person}</span>
            </div>
          )}
          {selectedPO.supplier?.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">{selectedPO.supplier.email}</span>
            </div>
          )}
          {selectedPO.supplier?.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm">{selectedPO.supplier.phone}</span>
            </div>
          )}
          {(selectedPO.supplier?.address || selectedPO.supplier?.city) && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <span className="text-sm whitespace-pre-wrap">
                {[
                  selectedPO.supplier.address,
                  [
                    selectedPO.supplier.city,
                    selectedPO.supplier.state,
                    selectedPO.supplier.zip_code,
                  ]
                    .filter(Boolean)
                    .join(", "),
                  selectedPO.supplier.country,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface LineItemsCardProps {
  selectedPO: PurchaseOrderWithDetails
}

export function LineItemsCard({ selectedPO }: LineItemsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Package className="h-4 w-4" />
            Line Items
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {selectedPO.items?.length || 0} item
            {(selectedPO.items?.length || 0) !== 1 ? "s" : ""}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {/* Mobile view - Cards */}
        <div className="sm:hidden space-y-3">
          {selectedPO.items?.map((item) => (
            <Card key={item.id} className="p-4 bg-muted/50 border-border">
              <div className="space-y-2">
                <div className="flex justify-between items-start">
                  <span className="text-xs text-muted-foreground font-medium">
                    Item #{item.line_number}
                  </span>
                  <Badge variant="outline" className="font-mono">
                    ${item.line_total.toFixed(2)}
                  </Badge>
                </div>
                <p className="font-medium text-sm">{item.description}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Qty: </span>
                    <span className="font-mono">{item.quantity_sqft.toLocaleString()} sq ft</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Unit: </span>
                    <span className="font-mono">${item.unit_cost.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Desktop view - Compact table */}
        <div className="hidden sm:block">
          <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10 px-3 font-semibold">#</TableHead>
                  <TableHead className="px-3 font-semibold">Description</TableHead>
                  <TableHead className="text-right px-3 w-28 font-semibold">Qty (sq ft)</TableHead>
                  <TableHead className="text-right px-3 w-24 font-semibold">Unit Cost</TableHead>
                  <TableHead className="text-right px-3 w-28 font-semibold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedPO.items?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-sm px-3">{item.line_number}</TableCell>
                    <TableCell className="text-sm px-3">
                      <div className="min-w-0">
                        <p className="truncate" title={item.description}>
                          {item.description}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm px-3">
                      {item.quantity_sqft.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm px-3">
                      ${item.unit_cost.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm px-3">
                      ${item.line_total.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface AddressesCardProps {
  selectedPO: PurchaseOrderWithDetails
}

export function AddressesCard({ selectedPO }: AddressesCardProps) {
  if (!selectedPO.shipping_address && !selectedPO.billing_address) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <MapPin className="h-4 w-4" />
          Addresses
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
          {selectedPO.shipping_address && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-[#E5E7EB]">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" />
                Shipping Address
              </Label>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {selectedPO.shipping_address}
              </p>
            </div>
          )}
          {selectedPO.billing_address && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-[#E5E7EB]">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Billing Address
              </Label>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {selectedPO.billing_address}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface OrderSummaryCardProps {
  selectedPO: PurchaseOrderWithDetails
  selectedPOTaxDetails: TaxDetails | null
}

export function OrderSummaryCard({ selectedPO, selectedPOTaxDetails }: OrderSummaryCardProps) {
  return (
    <Card className="border-[#E5E7EB]">
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Order Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono font-medium">${selectedPO.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Tax
              {selectedPOTaxDetails && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({taxService.formatTaxRate(selectedPOTaxDetails.taxRate)}
                  {selectedPOTaxDetails.taxLevel === "exempt"
                    ? " - Tax Exempt"
                    : selectedPOTaxDetails.taxLevel === "override"
                      ? " - Custom Rate"
                      : ""}
                  )
                </span>
              )}
            </span>
            <span className="font-mono font-medium">${selectedPO.tax_amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span className="font-mono font-medium">${selectedPO.shipping_cost.toFixed(2)}</span>
          </div>
          <Separator className="my-1" />
          <div className="flex justify-between items-center pt-1">
            <span className="font-semibold text-lg text-[#111827]">Total</span>
            <span className="font-mono font-bold text-xl text-[#2563EB]">
              ${selectedPO.total_amount.toFixed(2)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

interface NotesCardProps {
  notes: string
}

export function NotesCard({ notes }: NotesCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <p className="text-sm whitespace-pre-wrap leading-relaxed text-[#111827]">{notes}</p>
      </CardContent>
    </Card>
  )
}
