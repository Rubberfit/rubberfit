"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"

interface QuickCreateFormData {
  material_type: string
  width: string
  length: string
  thickness: string
  color: string
  location: string
  supplier: string
  cost_per_sqft: string
  notes: string
}

interface QuickCreateFormProps {
  formData: QuickCreateFormData
  materialTypes: string[]
  onFieldChange: (field: keyof QuickCreateFormData, value: string) => void
  onSubmit: (e: React.FormEvent) => void
  onCancel: () => void
}

export function QuickCreateForm({
  formData,
  materialTypes,
  onFieldChange,
  onSubmit,
  onCancel,
}: QuickCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="material_type">Material Type *</Label>
          <Select
            value={formData.material_type}
            onValueChange={(value) => onFieldChange("material_type", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              {materialTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={formData.location}
            onChange={(e) => onFieldChange("location", e.target.value)}
            placeholder="e.g., Rack A, Bin 3"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="width">Width (inches) *</Label>
          <Input
            id="width"
            type="number"
            step="0.001"
            value={formData.width}
            onChange={(e) => onFieldChange("width", e.target.value)}
            placeholder="36"
            required
          />
        </div>

        <div>
          <Label htmlFor="length">Length (inches) *</Label>
          <Input
            id="length"
            type="number"
            step="0.001"
            value={formData.length}
            onChange={(e) => onFieldChange("length", e.target.value)}
            placeholder="240"
            required
          />
        </div>

        <div>
          <Label htmlFor="thickness">Thickness (inches) *</Label>
          <Input
            id="thickness"
            type="number"
            step="0.001"
            value={formData.thickness}
            onChange={(e) => onFieldChange("thickness", e.target.value)}
            placeholder="0.25"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="color">Color</Label>
          <Input
            id="color"
            value={formData.color}
            onChange={(e) => onFieldChange("color", e.target.value)}
            placeholder="e.g., Black"
          />
        </div>

        <div>
          <Label htmlFor="cost_per_sqft">Cost per Sq Ft ($)</Label>
          <Input
            id="cost_per_sqft"
            type="number"
            step="0.0001"
            value={formData.cost_per_sqft}
            onChange={(e) => onFieldChange("cost_per_sqft", e.target.value)}
            placeholder="2.50"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="supplier">Supplier</Label>
        <Input
          id="supplier"
          value={formData.supplier}
          onChange={(e) => onFieldChange("supplier", e.target.value)}
          placeholder="e.g., ABC Rubber Co."
        />
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => onFieldChange("notes", e.target.value)}
          placeholder="Additional notes about this roll"
          className="h-20"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add Roll</Button>
      </DialogFooter>
    </form>
  )
}
