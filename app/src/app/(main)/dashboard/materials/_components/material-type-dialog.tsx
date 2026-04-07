"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface MaterialTypeForm {
  name: string
  description: string
  default_cost: string
  min_stock_alert: string
}

interface MaterialTypeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEditing: boolean
  formData: MaterialTypeForm
  onFormDataChange: (data: MaterialTypeForm) => void
  onSubmit: () => void
  submitting: boolean
}

export function MaterialTypeDialog({
  open,
  onOpenChange,
  isEditing,
  formData,
  onFormDataChange,
  onSubmit,
  submitting,
}: MaterialTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Material Type" : "Add Material Type"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the material type information"
              : "Add a new material type to your inventory system"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
              placeholder="e.g., Neoprene, EPDM, Silicone"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
              placeholder="Material properties and characteristics"
              rows={3}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="default_cost">Default Cost (per sq ft)</Label>
            <Input
              id="default_cost"
              type="number"
              step="0.01"
              min="0"
              value={formData.default_cost}
              onChange={(e) => onFormDataChange({ ...formData, default_cost: e.target.value })}
              placeholder="2.50"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="min_stock_alert">Low Stock Alert (sq ft)</Label>
            <Input
              id="min_stock_alert"
              type="number"
              step="1"
              min="0"
              value={formData.min_stock_alert}
              onChange={(e) => onFormDataChange({ ...formData, min_stock_alert: e.target.value })}
              placeholder="100"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting}>
            {submitting ? "Saving..." : isEditing ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
