"use client"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"

interface NewMaterial {
  name: string
  description: string
  default_cost: number
  min_stock_alert: number
}

interface MaterialDialogsProps {
  newMaterialDialog: boolean
  onNewMaterialDialogChange: (open: boolean) => void
  newMaterial: NewMaterial
  onNewMaterialChange: (material: NewMaterial) => void
  onAddMaterial: () => void
  deleteMaterialDialog: string | null
  onDeleteMaterialDialogChange: (id: string | null) => void
  onDeleteMaterial: (id: string) => void
}

export function MaterialDialogs({
  newMaterialDialog,
  onNewMaterialDialogChange,
  newMaterial,
  onNewMaterialChange,
  onAddMaterial,
  deleteMaterialDialog,
  onDeleteMaterialDialogChange,
  onDeleteMaterial,
}: MaterialDialogsProps) {
  return (
    <>
      {/* Add Material Dialog */}
      <Dialog open={newMaterialDialog} onOpenChange={onNewMaterialDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Material Type</DialogTitle>
            <DialogDescription>Create a new material type for your inventory</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-name">Material Name *</Label>
              <Input
                id="new-name"
                value={newMaterial.name}
                onChange={(e) => onNewMaterialChange({ ...newMaterial, name: e.target.value })}
                placeholder="e.g., Neoprene"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                value={newMaterial.description}
                onChange={(e) =>
                  onNewMaterialChange({ ...newMaterial, description: e.target.value })
                }
                placeholder="e.g., General purpose synthetic rubber"
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-stock">Min Stock Alert (sqft)</Label>
                <Input
                  id="new-stock"
                  type="number"
                  min="0"
                  step="10"
                  value={newMaterial.min_stock_alert}
                  onChange={(e) =>
                    onNewMaterialChange({
                      ...newMaterial,
                      min_stock_alert: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-cost">Default Cost per sqft ($)</Label>
                <Input
                  id="new-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newMaterial.default_cost}
                  onChange={(e) =>
                    onNewMaterialChange({
                      ...newMaterial,
                      default_cost: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onNewMaterialDialogChange(false)}>
              Cancel
            </Button>
            <Button onClick={onAddMaterial}>Add Material</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteMaterialDialog}
        onOpenChange={() => onDeleteMaterialDialogChange(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Material Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this material type? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMaterialDialog && onDeleteMaterial(deleteMaterialDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
