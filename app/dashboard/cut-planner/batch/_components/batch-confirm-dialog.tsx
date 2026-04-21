"use client"

import { Button } from "@/app/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import type { Roll } from "@/src/entities"

interface CutOptimization {
  roll: Roll
  total_length_needed: number
  material_used_sqft: number
  waste_sqft: number
  waste_percentage: number
  remaining_length_after: number
  remaining_value_after: number
  score: number
}

interface BatchCutItem {
  id: string
  materialType: string
  width: number
  length: number
  quantity: number
  thickness?: number
}

interface BatchOptimizationResult {
  cuts: Array<{
    cutRequest: BatchCutItem
    recommendation: CutOptimization
  }>
  totalWaste: number
  totalMaterialUsed: number
  wastePercentage: number
}

interface BatchConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  optimizationResult: BatchOptimizationResult | null
  processing: boolean
  onConfirm: () => void
}

export function BatchConfirmDialog({
  open,
  onOpenChange,
  optimizationResult,
  processing,
  onConfirm,
}: BatchConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Batch Execution</DialogTitle>
          <DialogDescription>
            This will process {optimizationResult?.cuts.length} cuts and update inventory
            accordingly. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {optimizationResult && (
          <div className="py-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Cuts:</span>
                <span className="font-medium">{optimizationResult.cuts.length}</span>
              </div>
              <div className="flex justify-between">
                <span>Material Used:</span>
                <span className="font-medium">
                  {optimizationResult.totalMaterialUsed.toFixed(2)} sqft
                </span>
              </div>
              <div className="flex justify-between">
                <span>Waste:</span>
                <span className="font-medium">
                  {optimizationResult.totalWaste.toFixed(2)} sqft (
                  {optimizationResult.wastePercentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={processing}>
            {processing ? "Processing..." : "Confirm & Execute"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
