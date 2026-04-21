"use client"

import { Plus, X, MapPin } from "lucide-react"

import {
  type Supplier,
  type MaterialType,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/database.types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Separator } from "@/app/components/ui/separator"
import { type TaxDetails } from "./po-tax-helpers"
import {
  type POFormData,
  getDefaultFormData,
  buildSupplierAddress,
  getEmptyItem,
} from "./po-form-dialog"

interface POEditDialogProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  editingPO: PurchaseOrderWithDetails | null
  setEditingPO: (po: PurchaseOrderWithDetails | null) => void
  editFormData: POFormData
  setEditFormData: (data: POFormData) => void
  suppliers: Supplier[]
  materialTypes: MaterialType[]
  isUpdating: boolean
  editFormTaxDetails: TaxDetails | null
  onUpdatePO: () => void
  onConfirmRemoveItem: (action: () => void, index: number) => void
}

export function POEditDialog({
  isOpen,
  setIsOpen,
  editingPO,
  setEditingPO,
  editFormData,
  setEditFormData,
  suppliers,
  materialTypes,
  isUpdating,
  editFormTaxDetails,
  onUpdatePO,
  onConfirmRemoveItem,
}: POEditDialogProps) {
  if (!editingPO) return null

  const addItem = () => {
    setEditFormData({ ...editFormData, items: [...editFormData.items, getEmptyItem()] })
  }

  const removeItem = (index: number) => {
    onConfirmRemoveItem(() => {
      setEditFormData({ ...editFormData, items: editFormData.items.filter((_, i) => i !== index) })
    }, index)
  }

  const updateItem = (index: number, field: string, value: string | number) => {
    const updatedItems = [...editFormData.items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setEditFormData({ ...editFormData, items: updatedItems })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) {
          setEditingPO(null)
          setEditFormData(getDefaultFormData())
        }
      }}
    >
      <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Purchase Order</DialogTitle>
          <DialogDescription>Edit PO #{editingPO.po_number} (Draft Status Only)</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <EditOrderDetailsCard
            editFormData={editFormData}
            setEditFormData={setEditFormData}
            suppliers={suppliers}
          />

          <EditLineItemsCard
            editFormData={editFormData}
            materialTypes={materialTypes}
            addItem={addItem}
            removeItem={removeItem}
            updateItem={updateItem}
          />

          <EditAddressesCard editFormData={editFormData} setEditFormData={setEditFormData} />

          <EditNotesCard editFormData={editFormData} setEditFormData={setEditFormData} />

          {editFormData.items.length > 0 && (
            <EditOrderSummary editFormData={editFormData} editFormTaxDetails={editFormTaxDetails} />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false)
              setEditingPO(null)
              setEditFormData(getDefaultFormData())
            }}
            disabled={isUpdating}
          >
            Cancel
          </Button>
          <Button
            onClick={onUpdatePO}
            disabled={isUpdating || !editFormData.supplier_id || editFormData.items.length === 0}
          >
            {isUpdating ? "Updating..." : "Update Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Sub-components ---

function EditOrderDetailsCard({
  editFormData,
  setEditFormData,
  suppliers,
}: {
  editFormData: POFormData
  setEditFormData: (d: POFormData) => void
  suppliers: Supplier[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Details</CardTitle>
        <CardDescription>Basic information for this purchase order</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-supplier">Supplier *</Label>
            <Select
              value={editFormData.supplier_id}
              onValueChange={(value) => {
                const newSupplier = suppliers.find((s) => s.id === value)
                const newAddress = buildSupplierAddress(newSupplier)
                setEditFormData({
                  ...editFormData,
                  supplier_id: value,
                  shipping_address: editFormData.shipping_address || newAddress,
                  billing_address: editFormData.billing_address || newAddress,
                })
              }}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Select supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editFormData.supplier_id &&
              (() => {
                const sel = suppliers.find((s) => s.id === editFormData.supplier_id)
                return sel && (sel.city || sel.state) ? (
                  <p className="text-sm text-gray-600 mt-1">
                    <MapPin className="inline h-3 w-3 mr-1" />
                    {sel.city && `${sel.city}, `}
                    {sel.state} {sel.zip_code}
                    {sel.tax_exempt && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Tax Exempt
                      </Badge>
                    )}
                  </p>
                ) : null
              })()}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-delivery_date">Requested Delivery Date</Label>
            <Input
              type="date"
              value={editFormData.requested_delivery_date}
              onChange={(e) =>
                setEditFormData({ ...editFormData, requested_delivery_date: e.target.value })
              }
              className="min-h-[44px]"
            />
          </div>
        </div>
        <div className="grid gap-6 grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="edit-payment_terms">Payment Terms</Label>
            <Select
              value={editFormData.payment_terms}
              onValueChange={(v) => setEditFormData({ ...editFormData, payment_terms: v })}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Net 30">Net 30</SelectItem>
                <SelectItem value="Net 60">Net 60</SelectItem>
                <SelectItem value="Net 90">Net 90</SelectItem>
                <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EditLineItemsCard({
  editFormData,
  materialTypes,
  addItem,
  removeItem,
  updateItem,
}: {
  editFormData: POFormData
  materialTypes: MaterialType[]
  addItem: () => void
  removeItem: (i: number) => void
  updateItem: (i: number, f: string, v: string | number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>Products to order from this supplier</CardDescription>
          </div>
          <Button type="button" variant="outline" className="min-h-[44px]" onClick={addItem}>
            <Plus className="h-4 w-4 mr-2" />
            Add Item
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {editFormData.items.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <p className="text-muted-foreground">No items added yet</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>
              Add First Item
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {editFormData.items.map((item, index) => (
              <div key={index} className="border rounded-lg p-6 space-y-6 bg-muted/30">
                <div className="flex justify-between items-start">
                  <h4 className="font-medium">Item #{index + 1}</h4>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[44px]"
                    onClick={() => removeItem(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Material Type</Label>
                    <Select
                      value={item.material_type_id}
                      onValueChange={(v) => updateItem(index, "material_type_id", v)}
                    >
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {materialTypes.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="Item description"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Quantity (sq ft)</Label>
                      <Input
                        type="number"
                        value={item.quantity_sqft}
                        onChange={(e) =>
                          updateItem(index, "quantity_sqft", parseFloat(e.target.value) || 0)
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Unit Cost ($/sq ft)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={item.unit_cost}
                        onChange={(e) =>
                          updateItem(index, "unit_cost", parseFloat(e.target.value) || 0)
                        }
                        className="min-h-[44px]"
                      />
                    </div>
                  </div>
                </div>
                <div className="text-right text-sm">
                  Line Total:{" "}
                  <span className="font-mono font-semibold">
                    ${(item.quantity_sqft * item.unit_cost).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EditAddressesCard({
  editFormData,
  setEditFormData,
}: {
  editFormData: POFormData
  setEditFormData: (d: POFormData) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Addresses</CardTitle>
        <CardDescription>Shipping and billing information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 grid-cols-2">
          <div className="space-y-2">
            <Label>Shipping Address</Label>
            <Textarea
              value={editFormData.shipping_address}
              onChange={(e) =>
                setEditFormData({ ...editFormData, shipping_address: e.target.value })
              }
              rows={4}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Billing Address</Label>
            <Textarea
              value={editFormData.billing_address}
              onChange={(e) =>
                setEditFormData({ ...editFormData, billing_address: e.target.value })
              }
              rows={4}
              className="min-h-[100px]"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EditNotesCard({
  editFormData,
  setEditFormData,
}: {
  editFormData: POFormData
  setEditFormData: (d: POFormData) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Additional Information</CardTitle>
        <CardDescription>Notes and special instructions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={editFormData.notes}
            onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
            placeholder="Additional notes or instructions"
            rows={4}
            className="min-h-[100px]"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function EditOrderSummary({
  editFormData,
  editFormTaxDetails,
}: {
  editFormData: POFormData
  editFormTaxDetails: TaxDetails | null
}) {
  const subtotal = editFormData.items.reduce(
    (sum, item) => sum + item.quantity_sqft * item.unit_cost,
    0
  )
  const taxRate = editFormTaxDetails?.taxRate || 0.08

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Order Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax ({(taxRate * 100).toFixed(2)}%)</span>
            <span className="font-mono">${(subtotal * taxRate).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span className="font-mono">$50.00</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">${(subtotal * (1 + taxRate) + 50).toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
