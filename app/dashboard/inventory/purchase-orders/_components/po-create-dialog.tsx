"use client"

import { Plus, X, MapPin } from "lucide-react"

import { type Supplier, type MaterialType } from "@/src/infrastructure/models/supabase"
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
import { taxService } from "@/src/infrastructure/services/taxService"
import { type TaxDetails } from "./po-tax-helpers"
import {
  type POFormData,
  getDefaultFormData,
  buildSupplierAddress,
  getEmptyItem,
} from "./po-form-dialog"

interface POCreateDialogProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  formData: POFormData
  setFormData: (data: POFormData) => void
  suppliers: Supplier[]
  materialTypes: MaterialType[]
  isCreating: boolean
  createFormTaxDetails: TaxDetails | null
  onCreatePO: () => void
  onConfirmRemoveItem: (action: () => void, index: number) => void
}

export function POCreateDialog({
  isOpen,
  setIsOpen,
  formData,
  setFormData,
  suppliers,
  materialTypes,
  isCreating,
  createFormTaxDetails,
  onCreatePO,
  onConfirmRemoveItem,
}: POCreateDialogProps) {
  const addItemToForm = () => {
    setFormData({ ...formData, items: [...formData.items, getEmptyItem()] })
  }

  const removeItemFromForm = (index: number) => {
    onConfirmRemoveItem(() => {
      setFormData({ ...formData, items: formData.items.filter((_, i) => i !== index) })
    }, index)
  }

  const updateItemInForm = (index: number, field: string, value: string | number) => {
    const updatedItems = [...formData.items]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setFormData({ ...formData, items: updatedItems })
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) setFormData(getDefaultFormData())
      }}
    >
      <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Order</DialogTitle>
          <DialogDescription>Create a new purchase order for materials</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <CreateOrderDetailsCard
            formData={formData}
            setFormData={setFormData}
            suppliers={suppliers}
          />

          <CreateLineItemsCard
            formData={formData}
            materialTypes={materialTypes}
            addItem={addItemToForm}
            removeItem={removeItemFromForm}
            updateItem={updateItemInForm}
          />

          <CreateAddressesCard formData={formData} setFormData={setFormData} />

          <CreateNotesCard formData={formData} setFormData={setFormData} />

          {formData.items.length > 0 && (
            <CreateOrderSummary
              formData={formData}
              suppliers={suppliers}
              createFormTaxDetails={createFormTaxDetails}
            />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false)
              setFormData(getDefaultFormData())
            }}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={onCreatePO}
            disabled={isCreating || !formData.supplier_id || formData.items.length === 0}
          >
            {isCreating ? "Creating..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Sub-components ---

function CreateOrderDetailsCard({
  formData,
  setFormData,
  suppliers,
}: {
  formData: POFormData
  setFormData: (d: POFormData) => void
  suppliers: Supplier[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Details</CardTitle>
        <CardDescription>Basic information for this purchase order</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier *</Label>
            <Select
              value={formData.supplier_id}
              onValueChange={(value) => {
                const newSupplier = suppliers.find((s) => s.id === value)
                const newAddress = buildSupplierAddress(newSupplier)
                setFormData({
                  ...formData,
                  supplier_id: value,
                  shipping_address: !formData.shipping_address
                    ? newAddress
                    : formData.shipping_address,
                  billing_address: !formData.billing_address
                    ? newAddress
                    : formData.billing_address,
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
            {formData.supplier_id &&
              (() => {
                const sel = suppliers.find((s) => s.id === formData.supplier_id)
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
            <Label htmlFor="delivery_date">Requested Delivery Date</Label>
            <Input
              type="date"
              value={formData.requested_delivery_date}
              onChange={(e) =>
                setFormData({ ...formData, requested_delivery_date: e.target.value })
              }
              className="min-h-[44px]"
            />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payment_terms">Payment Terms</Label>
            <Select
              value={formData.payment_terms}
              onValueChange={(value) => setFormData({ ...formData, payment_terms: value })}
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

function CreateLineItemsCard({
  formData,
  materialTypes,
  addItem,
  removeItem,
  updateItem,
}: {
  formData: POFormData
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
        {formData.items.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <p className="text-muted-foreground">No items added yet</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={addItem}>
              Add First Item
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {formData.items.map((item, index) => (
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

function CreateAddressesCard({
  formData,
  setFormData,
}: {
  formData: POFormData
  setFormData: (d: POFormData) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Addresses</CardTitle>
        <CardDescription>Shipping and billing information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Shipping Address</Label>
            <Textarea
              value={formData.shipping_address}
              onChange={(e) => setFormData({ ...formData, shipping_address: e.target.value })}
              rows={4}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label>Billing Address</Label>
            <Textarea
              value={formData.billing_address}
              onChange={(e) => setFormData({ ...formData, billing_address: e.target.value })}
              rows={4}
              className="min-h-[100px]"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CreateNotesCard({
  formData,
  setFormData,
}: {
  formData: POFormData
  setFormData: (d: POFormData) => void
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
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Additional notes or instructions"
            rows={4}
            className="min-h-[100px]"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function CreateOrderSummary({
  formData,
  suppliers,
  createFormTaxDetails,
}: {
  formData: POFormData
  suppliers: Supplier[]
  createFormTaxDetails: TaxDetails | null
}) {
  const subtotal = formData.items.reduce(
    (sum, item) => sum + item.quantity_sqft * item.unit_cost,
    0
  )
  const taxRate = createFormTaxDetails?.taxRate || 0.08
  const shipping = suppliers.find((s) => s.id === formData.supplier_id)?.default_shipping_cost || 50

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
            <span>
              Tax
              {createFormTaxDetails && (
                <span className="ml-1 text-xs text-gray-600">
                  ({taxService.formatTaxRate(createFormTaxDetails.taxRate)}
                  {createFormTaxDetails.taxLevel === "exempt"
                    ? " - Tax Exempt"
                    : createFormTaxDetails.taxLevel === "override"
                      ? " - Custom Rate"
                      : ""}
                  )
                </span>
              )}
            </span>
            <span className="font-mono">${(subtotal * taxRate).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Shipping</span>
            <span className="font-mono">${shipping.toFixed(2)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="font-mono">${(subtotal * (1 + taxRate) + shipping).toFixed(2)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
