"use client"

import { Calculator, Info } from "lucide-react"
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
import { Switch } from "@/app/components/ui/switch"
import { Alert, AlertDescription } from "@/app/components/ui/alert"
import { Separator } from "@/app/components/ui/separator"
import type { MaterialType, Supplier } from "@/src/infrastructure/models/supabase"

interface FormData {
  material_type_id: string
  supplier_id: string
  reorder_point: number
  reorder_quantity: number
  max_stock_level: number
  lead_time_days: number
  safety_stock_days: number
  auto_reorder: boolean
  active: boolean
  notes: string
}

interface EOQData {
  annualDemand: number
  orderingCost: number
  holdingCost: number
  calculatedEOQ: number
}

interface MaterialSupplierFieldsProps {
  formData: FormData
  setFormData: (data: FormData) => void
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  isEditing: boolean
}

export function MaterialSupplierFields({
  formData,
  setFormData,
  materialTypes,
  suppliers,
  isEditing,
}: MaterialSupplierFieldsProps) {
  const selectedMaterial = materialTypes.find((m) => m.id === formData.material_type_id)
  const selectedSupplier = suppliers.find((s) => s.id === formData.supplier_id)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="material">Material Type *</Label>
        <Select
          value={formData.material_type_id}
          onValueChange={(value) => setFormData({ ...formData, material_type_id: value })}
          disabled={isEditing}
        >
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder="Select material type" />
          </SelectTrigger>
          <SelectContent>
            {materialTypes.map((material) => (
              <SelectItem key={material.id} value={material.id}>
                {material.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedMaterial && (
          <p className="text-sm text-muted-foreground">
            Default cost: ${selectedMaterial.default_cost?.toFixed(2) || "N/A"} per sq ft
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="supplier">Preferred Supplier</Label>
        <Select
          value={formData.supplier_id || "none"}
          onValueChange={(value) =>
            setFormData({ ...formData, supplier_id: value === "none" ? "" : value })
          }
        >
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder="Select supplier (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No preference</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedSupplier && (
          <p className="text-sm text-muted-foreground">
            Payment terms: {selectedSupplier.payment_terms || "N/A"}
          </p>
        )}
      </div>
    </div>
  )
}

interface StockLevelFieldsProps {
  formData: FormData
  setFormData: (data: FormData) => void
  eoqData: EOQData
  onCalculateReorderPoint: () => void
}

export function StockLevelFields({
  formData,
  setFormData,
  eoqData,
  onCalculateReorderPoint,
}: StockLevelFieldsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Stock Levels</h3>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="reorder_point">Reorder Point (sq ft) *</Label>
          <div className="flex gap-2">
            <Input
              id="reorder_point"
              type="number"
              value={formData.reorder_point}
              onChange={(e) =>
                setFormData({ ...formData, reorder_point: parseInt(e.target.value) || 0 })
              }
              required
              className="min-h-[44px]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="min-h-[44px] min-w-[44px] shrink-0"
              onClick={onCalculateReorderPoint}
              title="Calculate reorder point"
            >
              <Calculator className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Trigger reorder when stock falls below this level
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reorder_quantity">Reorder Quantity (sq ft) *</Label>
          <div className="flex gap-2">
            <Input
              id="reorder_quantity"
              type="number"
              value={formData.reorder_quantity}
              onChange={(e) =>
                setFormData({ ...formData, reorder_quantity: parseInt(e.target.value) || 0 })
              }
              required
              className="min-h-[44px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] shrink-0 text-xs"
              onClick={() => setFormData({ ...formData, reorder_quantity: eoqData.calculatedEOQ })}
              disabled={!eoqData.calculatedEOQ}
            >
              Use EOQ
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Amount to order when reorder point is reached
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_stock">Max Stock Level (sq ft)</Label>
          <Input
            id="max_stock"
            type="number"
            value={formData.max_stock_level}
            onChange={(e) =>
              setFormData({ ...formData, max_stock_level: parseInt(e.target.value) || 0 })
            }
            className="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">Maximum inventory level (optional)</p>
        </div>
      </div>
    </div>
  )
}

interface TimingFieldsProps {
  formData: FormData
  setFormData: (data: FormData) => void
}

export function TimingFields({ formData, setFormData }: TimingFieldsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Timing Parameters</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead_time">Lead Time (days) *</Label>
          <Input
            id="lead_time"
            type="number"
            value={formData.lead_time_days}
            onChange={(e) =>
              setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 0 })
            }
            required
            className="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">Days between order placement and delivery</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="safety_stock">Safety Stock (days) *</Label>
          <Input
            id="safety_stock"
            type="number"
            value={formData.safety_stock_days}
            onChange={(e) =>
              setFormData({ ...formData, safety_stock_days: parseInt(e.target.value) || 0 })
            }
            required
            className="min-h-[44px]"
          />
          <p className="text-xs text-muted-foreground">Buffer stock to prevent stockouts</p>
        </div>
      </div>
    </div>
  )
}

interface EOQCalculatorFieldsProps {
  eoqData: EOQData
  setEoqData: (data: EOQData) => void
  onCalculateEOQ: () => void
}

export function EOQCalculatorFields({
  eoqData,
  setEoqData,
  onCalculateEOQ,
}: EOQCalculatorFieldsProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">EOQ Calculator (Optional)</h3>
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Calculate Economic Order Quantity for optimal reorder amounts
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 md:grid-cols-3 mt-4">
        <div className="space-y-2">
          <Label htmlFor="annual_demand">Annual Demand (sq ft)</Label>
          <Input
            id="annual_demand"
            type="number"
            value={eoqData.annualDemand}
            onChange={(e) =>
              setEoqData({ ...eoqData, annualDemand: parseFloat(e.target.value) || 0 })
            }
            className="min-h-[44px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ordering_cost">Ordering Cost ($)</Label>
          <Input
            id="ordering_cost"
            type="number"
            step="0.01"
            value={eoqData.orderingCost}
            onChange={(e) =>
              setEoqData({ ...eoqData, orderingCost: parseFloat(e.target.value) || 0 })
            }
            className="min-h-[44px]"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="holding_cost">Holding Cost ($/sq ft/year)</Label>
          <Input
            id="holding_cost"
            type="number"
            step="0.01"
            value={eoqData.holdingCost}
            onChange={(e) =>
              setEoqData({ ...eoqData, holdingCost: parseFloat(e.target.value) || 0 })
            }
            className="min-h-[44px]"
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <Button type="button" variant="outline" onClick={onCalculateEOQ}>
          <Calculator className="h-4 w-4 mr-2" />
          Calculate EOQ
        </Button>
        {eoqData.calculatedEOQ > 0 && (
          <span className="font-mono font-semibold">EOQ: {eoqData.calculatedEOQ} sq ft</span>
        )}
      </div>
    </div>
  )
}

interface SettingsNotesFieldsProps {
  formData: FormData
  setFormData: (data: FormData) => void
}

export function SettingsNotesFields({ formData, setFormData }: SettingsNotesFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="auto_reorder">Auto-Reorder</Label>
          <p className="text-xs text-muted-foreground">
            Automatically create POs when reorder point is reached
          </p>
        </div>
        <Switch
          id="auto_reorder"
          checked={formData.auto_reorder}
          onCheckedChange={(checked) => setFormData({ ...formData, auto_reorder: checked })}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label htmlFor="active">Active Rule</Label>
          <p className="text-xs text-muted-foreground">Enable or disable this reorder rule</p>
        </div>
        <Switch
          id="active"
          checked={formData.active}
          onCheckedChange={(checked) => setFormData({ ...formData, active: checked })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Additional notes or special instructions..."
          rows={3}
          className="resize-none"
        />
      </div>
    </div>
  )
}

interface ReorderRuleFormFieldsProps {
  formData: FormData
  setFormData: (data: FormData) => void
  eoqData: EOQData
  setEoqData: (data: EOQData) => void
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  isEditing: boolean
  onCalculateEOQ: () => void
  onCalculateReorderPoint: () => void
}

export function ReorderRuleFormFields({
  formData,
  setFormData,
  eoqData,
  setEoqData,
  materialTypes,
  suppliers,
  isEditing,
  onCalculateEOQ,
  onCalculateReorderPoint,
}: ReorderRuleFormFieldsProps) {
  return (
    <>
      <MaterialSupplierFields
        formData={formData}
        setFormData={setFormData}
        materialTypes={materialTypes}
        suppliers={suppliers}
        isEditing={isEditing}
      />

      <Separator />

      <StockLevelFields
        formData={formData}
        setFormData={setFormData}
        eoqData={eoqData}
        onCalculateReorderPoint={onCalculateReorderPoint}
      />

      <Separator />

      <TimingFields formData={formData} setFormData={setFormData} />

      <Separator />

      <EOQCalculatorFields
        eoqData={eoqData}
        setEoqData={setEoqData}
        onCalculateEOQ={onCalculateEOQ}
      />

      <Separator />

      <SettingsNotesFields formData={formData} setFormData={setFormData} />
    </>
  )
}
