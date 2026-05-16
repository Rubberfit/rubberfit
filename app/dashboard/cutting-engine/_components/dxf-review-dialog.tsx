"use client"

import React, { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import type { DxfImportedPart, RejectedEntity, UnitSystem } from "@/src/application/cad/dxf-types"
import type { DxfPartCandidate } from "@/src/application/cad/group-parts"
import { sanitizePolygonWithHoles } from "@/src/application/cad/sanitize-polygon-with-holes"
import {
  baseName,
  buildWarnings,
  type Bbox,
  CenterPreview,
  DimensionsLine,
  HoleCountChip,
  LargePreview,
  PartListRail,
  PartNumberField,
  QuantityField,
  UnitPicker,
  WarningsBanner,
} from "./dxf-review-dialog-parts"

interface DxfReviewDialogProps {
  open: boolean
  parts: DxfPartCandidate[]
  detectedUnits: UnitSystem | undefined
  rejected: RejectedEntity[]
  ignoredLayers: string[]
  sourceFile: string
  onConfirm: (part: DxfImportedPart) => void
  onCancel: () => void
}

/* ------------------------------------------------------------------ */
/*  Mode renderers                                                     */
/* ------------------------------------------------------------------ */

function EmptyDxfDialog({
  open,
  sourceFile,
  onCancel,
}: {
  open: boolean
  sourceFile: string
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review DXF Import</DialogTitle>
          <DialogDescription>{baseName(sourceFile)}</DialogDescription>
        </DialogHeader>
        <div className="py-12 text-center">
          <p className="text-muted-foreground">No valid parts found in this DXF file.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled>Add Part</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface ConfirmControlsProps {
  units: UnitSystem | undefined
  detectedUnits: UnitSystem | undefined
  onUnitsChange: (next: UnitSystem) => void
  bbox: Bbox | undefined
  quantity: number
  onQuantityChange: (next: number) => void
  partNumber: string
  partNumberPlaceholder: string
  onPartNumberChange: (next: string) => void
  idPrefix: string
}

function ConfirmControls({
  units,
  detectedUnits,
  onUnitsChange,
  bbox,
  quantity,
  onQuantityChange,
  partNumber,
  partNumberPlaceholder,
  onPartNumberChange,
  idPrefix,
}: ConfirmControlsProps) {
  return (
    <>
      <UnitPicker units={units} detectedUnits={detectedUnits} onChange={onUnitsChange} />
      <DimensionsLine bbox={bbox} units={units} />
      <QuantityField id={`${idPrefix}-qty`} value={quantity} onChange={onQuantityChange} />
      <PartNumberField
        id={`${idPrefix}-pn`}
        value={partNumber}
        placeholder={partNumberPlaceholder}
        onChange={onPartNumberChange}
      />
    </>
  )
}

interface SinglePartDialogProps {
  open: boolean
  part: DxfPartCandidate
  detectedUnits: UnitSystem | undefined
  warnings: string[]
  sourceFile: string
  units: UnitSystem | undefined
  setUnits: (next: UnitSystem) => void
  quantity: number
  setQuantity: (next: number) => void
  partNumber: string
  setPartNumber: (next: string) => void
  defaultedPartNumber: string
  canConfirm: boolean
  onConfirm: () => void
  onCancel: () => void
}

function SinglePartDialog(props: SinglePartDialogProps) {
  const {
    open,
    part,
    detectedUnits,
    warnings,
    sourceFile,
    units,
    setUnits,
    quantity,
    setQuantity,
    partNumber,
    setPartNumber,
    defaultedPartNumber,
    canConfirm,
    onConfirm,
    onCancel,
  } = props
  const holeCount = part.polygon.holes.length
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review DXF Import</DialogTitle>
          <DialogDescription>{baseName(sourceFile)}</DialogDescription>
        </DialogHeader>

        <WarningsBanner warnings={warnings} />

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            {holeCount > 0 && (
              <div className="flex items-center gap-2">
                <HoleCountChip count={holeCount} />
              </div>
            )}
            <LargePreview polygon={part.polygon} bbox={part.bbox} svgSize={320} />
          </div>
          <div className="space-y-4">
            <ConfirmControls
              units={units}
              detectedUnits={detectedUnits}
              onUnitsChange={setUnits}
              bbox={part.bbox}
              quantity={quantity}
              onQuantityChange={setQuantity}
              partNumber={partNumber}
              partNumberPlaceholder={defaultedPartNumber}
              onPartNumberChange={setPartNumber}
              idPrefix="dxf"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm}>
            Add Part
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MultiPartDialogProps {
  open: boolean
  parts: DxfPartCandidate[]
  detectedUnits: UnitSystem | undefined
  warnings: string[]
  sourceFile: string
  selectedIdx: number
  setSelectedIdx: (idx: number) => void
  units: UnitSystem | undefined
  setUnits: (next: UnitSystem) => void
  quantity: number
  setQuantity: (next: number) => void
  partNumber: string
  setPartNumber: (next: string) => void
  defaultedPartNumber: string
  canConfirm: boolean
  onConfirm: () => void
  onCancel: () => void
}

function MultiPartDialog(props: MultiPartDialogProps) {
  const {
    open,
    parts,
    detectedUnits,
    warnings,
    sourceFile,
    selectedIdx,
    setSelectedIdx,
    units,
    setUnits,
    quantity,
    setQuantity,
    partNumber,
    setPartNumber,
    defaultedPartNumber,
    canConfirm,
    onConfirm,
    onCancel,
  } = props
  const selectedPart = parts[selectedIdx]
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Review DXF Import — {parts.length} parts found</DialogTitle>
          <DialogDescription>{baseName(sourceFile)}</DialogDescription>
        </DialogHeader>

        <WarningsBanner warnings={warnings} />

        <div className="grid grid-cols-[180px_1fr_220px] gap-4 min-h-[400px]">
          <PartListRail
            parts={parts}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
            units={units}
          />
          <CenterPreview
            selectedPart={selectedPart}
            selectedIdx={selectedIdx}
            total={parts.length}
          />
          <div className="space-y-4 pt-6">
            <ConfirmControls
              units={units}
              detectedUnits={detectedUnits}
              onUnitsChange={setUnits}
              bbox={selectedPart?.bbox}
              quantity={quantity}
              onQuantityChange={setQuantity}
              partNumber={partNumber}
              partNumberPlaceholder={defaultedPartNumber}
              onPartNumberChange={setPartNumber}
              idPrefix="dxf-multi"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm}>
            Add Part {selectedPart ? `(${selectedIdx + 1})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function DxfReviewDialog({
  open,
  parts,
  detectedUnits,
  rejected,
  ignoredLayers,
  sourceFile,
  onConfirm,
  onCancel,
}: DxfReviewDialogProps) {
  const [selectedIdx, setSelectedIdx] = useState(0)
  // The undefined state is meaningful — it disables confirm and
  // prompts the operator to pick a unit when the DXF didn't declare
  // $INSUNITS. Don't default to "mm" with `??`.
  const [units, setUnits] = useState<UnitSystem | undefined>(detectedUnits)
  const [quantity, setQuantity] = useState(1)
  const [partNumber, setPartNumber] = useState("")

  const selectedPart = parts[selectedIdx]
  const warnings = useMemo(() => buildWarnings(rejected, ignoredLayers), [rejected, ignoredLayers])

  const defaultedPartNumber = partNumber.trim() || baseName(sourceFile)
  const canConfirm = parts.length > 0 && selectedPart != null && quantity > 0 && units !== undefined

  function handleConfirm() {
    if (!canConfirm || !selectedPart || units === undefined) return
    // Sanitize: repair self-intersections, dedup vertices, enforce
    // CCW-outer / CW-hole. Returns null on unrepairable input.
    const sanitized = sanitizePolygonWithHoles(selectedPart.polygon)
    if (!sanitized) {
      toast.error(
        "Geometry could not be sanitized — the part may have disjoint outer rings or self-intersections that can't be repaired automatically."
      )
      return
    }
    onConfirm({
      partNumber: defaultedPartNumber,
      polygon: sanitized,
      quantity,
      units,
      sourceFile,
    })
  }

  if (parts.length === 0) {
    return <EmptyDxfDialog open={open} sourceFile={sourceFile} onCancel={onCancel} />
  }

  if (parts.length === 1) {
    return (
      <SinglePartDialog
        open={open}
        part={parts[0]}
        detectedUnits={detectedUnits}
        warnings={warnings}
        sourceFile={sourceFile}
        units={units}
        setUnits={setUnits}
        quantity={quantity}
        setQuantity={setQuantity}
        partNumber={partNumber}
        setPartNumber={setPartNumber}
        defaultedPartNumber={defaultedPartNumber}
        canConfirm={canConfirm}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      />
    )
  }

  return (
    <MultiPartDialog
      open={open}
      parts={parts}
      detectedUnits={detectedUnits}
      warnings={warnings}
      sourceFile={sourceFile}
      selectedIdx={selectedIdx}
      setSelectedIdx={setSelectedIdx}
      units={units}
      setUnits={setUnits}
      quantity={quantity}
      setQuantity={setQuantity}
      partNumber={partNumber}
      setPartNumber={setPartNumber}
      defaultedPartNumber={defaultedPartNumber}
      canConfirm={canConfirm}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  )
}
