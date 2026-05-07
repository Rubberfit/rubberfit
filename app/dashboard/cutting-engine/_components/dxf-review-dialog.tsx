"use client"

import React, { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import type {
  DxfImportedPart,
  Point2D,
  RejectedEntity,
  UnitSystem,
} from "@/src/application/cad/dxf-types"

interface DxfReviewDialogProps {
  open: boolean
  loop: Point2D[]
  detectedUnits: UnitSystem | undefined
  rejected: RejectedEntity[]
  ignoredLayers: string[]
  sourceFile: string
  onConfirm: (part: DxfImportedPart) => void
  onCancel: () => void
}

const PREVIEW_SIZE = 320
const PREVIEW_PADDING = 12

export default function DxfReviewDialog({
  open,
  loop,
  detectedUnits,
  rejected,
  ignoredLayers,
  sourceFile,
  onConfirm,
  onCancel,
}: DxfReviewDialogProps) {
  // Initial state derives from the current DXF file. Parent re-mounts
  // the dialog with `key={sourceFile}` on each new file, so the state
  // here is fresh per import without the setState-in-effect anti-pattern.
  const [units, setUnits] = useState<UnitSystem | undefined>(detectedUnits)
  const [quantity, setQuantity] = useState<number>(1)
  const [partNumber, setPartNumber] = useState<string>("")

  const bbox = useMemo(() => computeBbox(loop), [loop])
  const preview = useMemo(() => buildPreview(loop, bbox), [loop, bbox])
  const dimensionLabel = useMemo(() => formatDims(bbox, units), [bbox, units])
  const warningMessages = useMemo(
    () => buildWarnings(rejected, ignoredLayers),
    [rejected, ignoredLayers]
  )

  const canConfirm = units !== undefined && quantity >= 1 && loop.length >= 3
  const defaultedPartNumber = partNumber.trim() || baseName(sourceFile)

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review DXF Part</DialogTitle>
          <DialogDescription>
            {sourceFile} - {loop.length} vertices
          </DialogDescription>
        </DialogHeader>

        {warningMessages.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div className="space-y-1">
              {warningMessages.map((msg, i) => (
                <p key={i}>{msg}</p>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
          <div className="rounded-lg border border-border bg-muted/30 p-2">
            <svg
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              viewBox={`0 0 ${PREVIEW_SIZE} ${PREVIEW_SIZE}`}
              role="img"
              aria-label="DXF outline preview"
            >
              <g transform={`translate(${PREVIEW_PADDING}, ${PREVIEW_PADDING})`}>
                <g transform={`translate(0, ${PREVIEW_SIZE - 2 * PREVIEW_PADDING}) scale(1, -1)`}>
                  <polygon
                    points={preview.points
                      .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
                      .join(" ")}
                    fill="rgba(59,130,246,0.18)"
                    stroke="#1d4ed8"
                    strokeWidth={1.5}
                  />
                </g>
              </g>
            </svg>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Units</label>
              <div className="mt-1 inline-flex rounded border border-border">
                <UnitButton active={units === "mm"} onClick={() => setUnits("mm")} label="mm" />
                <UnitButton
                  active={units === "inch"}
                  onClick={() => setUnits("inch")}
                  label="inch"
                />
              </div>
              {detectedUnits === undefined && units === undefined && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  $INSUNITS not set in this DXF — pick a unit before confirming.
                </p>
              )}
              {detectedUnits !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Detected from $INSUNITS: {detectedUnits}.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground">
                Bounding box
              </label>
              <p className="mt-1 font-mono">{dimensionLabel}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="dxf-qty">
                Quantity
              </label>
              <input
                id="dxf-qty"
                type="number"
                min={1}
                step={1}
                className="mt-1 w-24 rounded border border-border bg-transparent px-2 py-1 text-sm"
                value={quantity}
                onChange={(e) => {
                  const next = Number(e.target.value)
                  if (Number.isFinite(next) && next >= 1) {
                    setQuantity(Math.round(next))
                  }
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="dxf-pn">
                Part number
              </label>
              <input
                id="dxf-pn"
                type="text"
                className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1 text-sm"
                value={partNumber}
                placeholder={baseName(sourceFile)}
                onChange={(e) => setPartNumber(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm || units === undefined) return
              onConfirm({
                partNumber: defaultedPartNumber,
                polygon: loop,
                quantity,
                units,
                sourceFile,
              })
            }}
          >
            Add Part
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UnitButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1 text-sm transition-colors first:rounded-l last:rounded-r " +
        (active ? "bg-blue-600 text-white" : "bg-transparent text-muted-foreground hover:bg-muted")
      }
    >
      {label}
    </button>
  )
}

function computeBbox(loop: Point2D[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (loop.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = loop[0].x
  let maxX = loop[0].x
  let minY = loop[0].y
  let maxY = loop[0].y
  for (const p of loop) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function buildPreview(
  loop: Point2D[],
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
): { points: Point2D[] } {
  const inner = PREVIEW_SIZE - 2 * PREVIEW_PADDING
  const w = bbox.maxX - bbox.minX
  const h = bbox.maxY - bbox.minY
  if (w <= 0 || h <= 0) return { points: [] }
  const scale = Math.min(inner / w, inner / h)
  const offsetX = (inner - w * scale) / 2
  const offsetY = (inner - h * scale) / 2
  return {
    points: loop.map((p) => ({
      x: (p.x - bbox.minX) * scale + offsetX,
      y: (p.y - bbox.minY) * scale + offsetY,
    })),
  }
}

function formatDims(
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  units: UnitSystem | undefined
): string {
  const w = bbox.maxX - bbox.minX
  const h = bbox.maxY - bbox.minY
  if (units === undefined) return `${w.toFixed(2)} × ${h.toFixed(2)}`
  const suffix = units === "mm" ? "mm" : '"'
  return `${w.toFixed(2)}${suffix} × ${h.toFixed(2)}${suffix}`
}

function buildWarnings(rejected: RejectedEntity[], ignoredLayers: string[]): string[] {
  const messages: string[] = []
  const counts = new Map<string, number>()
  for (const r of rejected) {
    const key = `${r.originalType}:${r.reason}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of counts) {
    const [type, reason] = key.split(":")
    messages.push(reasonCopy(type, reason, count))
  }
  if (ignoredLayers.length > 0) {
    messages.push(`Ignored layers (PR1 imports a single layer): ${ignoredLayers.join(", ")}.`)
  }
  return messages
}

function reasonCopy(type: string, reason: string, count: number): string {
  const plural = count === 1 ? "entity" : "entities"
  switch (reason) {
    case "curves-deferred-to-pr2":
      return `${count} ${type} ${plural} ignored - curve support coming in PR2.`
    case "polyline-curve-fit":
    case "polyline-spline-fit":
      return `${count} ${type} ${plural} ignored - curve-fit polylines coming in PR2.`
    case "polyline-3d":
    case "polyline-3d-mesh":
    case "polyline-polyface-mesh":
      return `${count} ${type} ${plural} ignored - 3D / mesh polylines are not supported.`
    case "polyline-not-closed":
    case "lwpolyline-not-closed":
      return `${count} open ${type} ${plural} ignored - PR1 imports closed loops only.`
    case "polyline-contains-bulge":
      return `${count} ${type} ${plural} ignored - flatten arc bulges in CAD before importing.`
    case "entity-type-unsupported":
      return `${count} ${type} ${plural} ignored.`
    default:
      return `${count} ${type} ${plural} ignored (${reason}).`
  }
}

function baseName(file: string): string {
  const trimmed = file.replace(/\\/g, "/")
  const last = trimmed.substring(trimmed.lastIndexOf("/") + 1)
  return last.replace(/\.[^.]+$/, "")
}
