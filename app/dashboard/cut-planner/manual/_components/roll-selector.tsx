"use client"

import { Package, CheckCircle, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import type { Roll } from "@/src/infrastructure/models/supabase"
import { UseFormReturn } from "react-hook-form"

interface CutRequest {
  width: number
  length: number
  quantity: number
}

interface WasteCalculation {
  totalLengthNeeded: number
  materialUsedSqft: number
  totalConsumedSqft: number
  wasteSqft: number
  wastePercentage: number
  remainingAfter: number
  canFit: boolean
}

interface RollSelectorProps {
  rolls: Roll[]
  selectedRoll: Roll | null
  onSelectRoll: (roll: Roll) => void
  wasteCalculation: WasteCalculation | null
  form: UseFormReturn<CutRequest>
}

export function RollSelectorTable({ rolls, selectedRoll, onSelectRoll }: RollSelectorProps) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Available Rolls
        </CardTitle>
        <CardDescription>Click on a roll to select it for your cut</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead>Remaining</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rolls.map((roll) => {
                const isSelected = selectedRoll?.id === roll.id
                return (
                  <TableRow key={roll.id} className={isSelected ? "bg-blue-50" : ""}>
                    <TableCell>{roll.material_type}</TableCell>
                    <TableCell>
                      {roll.width}" x {roll.length}" x {roll.thickness}"
                    </TableCell>
                    <TableCell>
                      <Badge variant={roll.remaining_length < 50 ? "destructive" : "default"}>
                        {roll.remaining_length}"
                      </Badge>
                    </TableCell>
                    <TableCell>{roll.location || "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => onSelectRoll(roll)}
                      >
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

interface SelectedRollInfoProps {
  selectedRoll: Roll
  wasteCalculation: WasteCalculation
}

export function SelectedRollInfo({ selectedRoll, wasteCalculation }: SelectedRollInfoProps) {
  return (
    <div className="p-4 bg-muted rounded-lg space-y-2">
      <div className="font-medium">Selected Roll</div>
      <div className="text-sm space-y-1">
        <div>{selectedRoll.material_type}</div>
        <div>
          {selectedRoll.width}" x {selectedRoll.remaining_length}"
        </div>
        <div>Location: {selectedRoll.location || "Unknown"}</div>
      </div>

      {wasteCalculation.canFit ? (
        <>
          <div className="text-sm space-y-1 pt-2 border-t">
            <div>Waste: {wasteCalculation.wastePercentage.toFixed(1)}%</div>
            <div>Remaining: {wasteCalculation.remainingAfter.toFixed(1)}"</div>
          </div>
          <Button type="submit" className="w-full">
            <CheckCircle className="mr-2 h-4 w-4" />
            Confirm Cut
          </Button>
        </>
      ) : (
        <div className="text-destructive text-sm font-medium pt-2 border-t">
          Roll cannot accommodate this cut
        </div>
      )}
    </div>
  )
}

interface ConfirmCutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedRoll: Roll | null
  wasteCalculation: WasteCalculation | null
  formValues: CutRequest
  processing: boolean
  onConfirm: () => void
}

export function ConfirmCutDialog({
  open,
  onOpenChange,
  selectedRoll,
  wasteCalculation,
  formValues,
  processing,
  onConfirm,
}: ConfirmCutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Manual Cut</DialogTitle>
          <DialogDescription>Please review the cut details before confirming</DialogDescription>
        </DialogHeader>

        {selectedRoll && wasteCalculation && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Roll:</span>
                <span className="text-sm font-medium">
                  {selectedRoll.material_type} ({selectedRoll.location || "No location"})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Cut Size:</span>
                <span className="text-sm font-medium">
                  {formValues.width}" x {formValues.length}" x {formValues.quantity}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Material Used:</span>
                <span className="text-sm font-medium">
                  {wasteCalculation.materialUsedSqft.toFixed(2)} sqft
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Waste:</span>
                <span className="text-sm font-medium text-destructive">
                  {wasteCalculation.wastePercentage.toFixed(1)}% (
                  {wasteCalculation.wasteSqft.toFixed(2)} sqft)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Remaining After:</span>
                <span className="text-sm font-medium">
                  {wasteCalculation.remainingAfter.toFixed(1)}"
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm text-amber-900">
                  This is a manual selection. The system optimization might have found a more
                  efficient option.
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={processing}>
            {processing ? "Processing..." : "Confirm Cut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
