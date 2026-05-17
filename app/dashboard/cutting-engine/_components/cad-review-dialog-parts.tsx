// Sub-components and pure formatters for the CAD review dialogs (DXF + SVG).
//
// Kept in a sibling file so each dialog stays under the per-file
// max-lines budget. The visual design (Kimi K2.6, design lock
// 2026-05-15 / SVG delta 2026-05-16) maps 1:1 to these primitives.
//
// Path rendering uses a single `<path>` with `fill-rule="evenodd"` and
// subpaths so hole rings render as voids without a per-loop element.
// Y is flipped to convert math-coords (Y up) to SVG (Y down).
//
// Renamed from `dxf-review-dialog-parts.tsx` when the SVG dialog joined
// the family — every primitive here is source-type agnostic. The only
// places that touch source-specific copy are `UnitPicker` (different
// "missing units" note per source) and `SourceTypeChip` (DXF / SVG label).

"use client"

import React, { useMemo } from "react"
import { AlertTriangle, FileImage } from "lucide-react"
import { cn } from "@/app/lib/utils"
import type { Point2D, PolygonWithHoles, UnitSystem } from "@/src/application/cad/dxf-types"
import type { DxfPartCandidate } from "@/src/application/cad/group-parts"

export { buildDxfWarnings, buildSvgWarnings } from "./cad-warning-copy"

export type Bbox = DxfPartCandidate["bbox"]

export type CadSourceType = "dxf" | "svg"

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

export function baseName(path: string): string {
  const trimmed = path.replace(/\\/g, "/")
  const last = trimmed.substring(trimmed.lastIndexOf("/") + 1)
  return last.replace(/\.[^.]+$/, "")
}

// Unit is a LABEL, not a conversion. The bbox values come straight
// from the source file (DXF $INSUNITS or SVG viewBox); we just append
// the operator-selected suffix.
export function formatDims(bbox: Bbox, units: UnitSystem | undefined): string {
  const w = bbox.maxX - bbox.minX
  const h = bbox.maxY - bbox.minY
  if (units === undefined) return `${w.toFixed(2)} × ${h.toFixed(2)}`
  const suffix = units === "mm" ? "mm" : '"'
  return `${w.toFixed(2)}${suffix} × ${h.toFixed(2)}${suffix}`
}

export function formatShortDims(bbox: Bbox, units: UnitSystem | undefined): string {
  const w = bbox.maxX - bbox.minX
  const h = bbox.maxY - bbox.minY
  const decimals = units === "inch" ? 2 : 1
  return `${w.toFixed(decimals)} × ${h.toFixed(decimals)}`
}

/* ------------------------------------------------------------------ */
/*  SVG path construction                                              */
/* ------------------------------------------------------------------ */

function buildPathD(
  polygon: PolygonWithHoles,
  bounds: Bbox,
  scale: number,
  padX: number,
  padY: number,
  svgSize: number
): string {
  const loopToSubpath = (loop: Point2D[]) =>
    loop
      .map((p, i) => {
        const x = (p.x - bounds.minX) * scale + padX
        // Flip Y to render math-coords (Y up) as SVG (Y down).
        const y = svgSize - ((p.y - bounds.minY) * scale + padY)
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`
      })
      .join(" ") + " Z"
  return [polygon.outer, ...polygon.holes].map(loopToSubpath).join(" ")
}

function fitViewBox(
  bounds: Bbox,
  svgSize: number,
  padPct: number
): { scale: number; padX: number; padY: number } {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  if (w <= 0 || h <= 0) return { scale: 1, padX: 0, padY: 0 }
  // pad is in pixels — must match the units of svgSize, not the bbox.
  const padPx = svgSize * padPct
  const scale = Math.min((svgSize - padPx * 2) / w, (svgSize - padPx * 2) / h)
  const padX = (svgSize - w * scale) / 2
  const padY = (svgSize - h * scale) / 2
  return { scale, padX, padY }
}

export function buildPathString(polygon: PolygonWithHoles, bounds: Bbox, svgSize: number): string {
  const { scale, padX, padY } = fitViewBox(bounds, svgSize, 0.1)
  return buildPathD(polygon, bounds, scale, padX, padY, svgSize)
}

/* ------------------------------------------------------------------ */
/*  Reusable visual building blocks                                    */
/* ------------------------------------------------------------------ */

interface UnitButtonProps {
  label: string
  isActive: boolean
  onClick: () => void
}

export function UnitButton({ label, isActive, onClick }: UnitButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md border transition-colors",
        isActive
          ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-600 dark:border-blue-600"
          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
      )}
    >
      {label}
    </button>
  )
}

interface PartThumbnailProps {
  part: DxfPartCandidate
  svgSize: number
  strokeWidth: number
}

export function PartThumbnail({ part, svgSize, strokeWidth }: PartThumbnailProps) {
  const d = useMemo(() => buildPathString(part.polygon, part.bbox, svgSize), [part, svgSize])
  return (
    <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="block">
      <path
        d={d}
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        className="text-slate-700 dark:text-slate-300"
      />
    </svg>
  )
}

interface HoleBadgeProps {
  count: number
}

export function HoleBadge({ count }: HoleBadgeProps) {
  if (count <= 0) return null
  return (
    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
      {count} hole{count === 1 ? "" : "s"}
    </span>
  )
}

interface LargePreviewProps {
  polygon: PolygonWithHoles
  bbox: Bbox
  svgSize: number
}

export function LargePreview({ polygon, bbox, svgSize }: LargePreviewProps) {
  const d = useMemo(() => buildPathString(polygon, bbox, svgSize), [polygon, bbox, svgSize])
  return (
    <div className="flex items-center justify-center bg-muted/40 dark:bg-muted/20 rounded-lg border border-border p-4">
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="block">
        <path
          d={d}
          fill="currentColor"
          fillRule="evenodd"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          className="text-slate-800 dark:text-slate-200"
        />
      </svg>
    </div>
  )
}

interface WarningsBannerProps {
  warnings: string[]
}

export function WarningsBanner({ warnings }: WarningsBannerProps) {
  if (warnings.length === 0) return null
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800 dark:text-amber-300">
              {w}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

interface HoleCountChipProps {
  count: number
}

export function HoleCountChip({ count }: HoleCountChipProps) {
  if (count <= 0) return null
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
      {count} hole{count === 1 ? "" : "s"}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Source-type chip                                                   */
/* ------------------------------------------------------------------ */

interface SourceTypeChipProps {
  type: CadSourceType
}

export function SourceTypeChip({ type }: SourceTypeChipProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
      <FileImage className="h-3 w-3" />
      {type.toUpperCase()}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Form fields (right-rail controls)                                  */
/* ------------------------------------------------------------------ */

interface UnitPickerProps {
  units: UnitSystem | undefined
  detectedUnits: UnitSystem | undefined
  sourceType: CadSourceType
  onChange: (next: UnitSystem) => void
}

export function UnitPicker({ units, detectedUnits, sourceType, onChange }: UnitPickerProps) {
  const missingNote =
    sourceType === "svg"
      ? "SVG has no explicit unit — pick mm or inch to match your viewBox intent."
      : "$INSUNITS not set in this DXF — pick a unit before confirming."

  const detectedLabel =
    sourceType === "svg" ? "Detected from SVG width: " : "Detected from $INSUNITS: "

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Units</label>
      <div className="flex gap-2">
        <UnitButton label="mm" isActive={units === "mm"} onClick={() => onChange("mm")} />
        <UnitButton label="inch" isActive={units === "inch"} onClick={() => onChange("inch")} />
      </div>
      {detectedUnits === undefined && units === undefined && (
        <p className="text-xs text-amber-700 dark:text-amber-300">{missingNote}</p>
      )}
      {detectedUnits !== undefined && (
        <p className="text-xs text-muted-foreground">
          {detectedLabel}
          {detectedUnits}.
        </p>
      )}
    </div>
  )
}

interface QuantityFieldProps {
  id: string
  value: number
  onChange: (next: number) => void
}

export function QuantityField({ id, value, onChange }: QuantityFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor={id}>
        Quantity
      </label>
      <input
        id={id}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, parseInt(e.target.value, 10) || 0))}
        className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}

interface PartNumberFieldProps {
  id: string
  value: string
  placeholder: string
  onChange: (next: string) => void
}

export function PartNumberField({ id, value, placeholder, onChange }: PartNumberFieldProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor={id}>
        Part Number
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}

interface DimensionsLineProps {
  bbox: Bbox | undefined
  units: UnitSystem | undefined
}

export function DimensionsLine({ bbox, units }: DimensionsLineProps) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Dimensions</label>
      <p className="text-sm text-muted-foreground font-mono">
        {bbox ? formatDims(bbox, units) : "—"}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Multi-part-only pieces                                             */
/* ------------------------------------------------------------------ */

interface PartListRailProps {
  parts: DxfPartCandidate[]
  selectedIdx: number
  setSelectedIdx: (idx: number) => void
  units: UnitSystem | undefined
}

export function PartListRail({ parts, selectedIdx, setSelectedIdx, units }: PartListRailProps) {
  const unitLabel = units === "mm" ? "mm" : units === "inch" ? "in" : ""
  return (
    <div className="flex flex-col gap-2 overflow-y-auto pr-1 max-h-[440px]">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
        Select part
      </p>
      {parts.map((part, idx) => {
        const isSelected = idx === selectedIdx
        const holeCount = part.polygon.holes.length
        const dims = formatShortDims(part.bbox, units)
        return (
          <button
            key={part.index}
            type="button"
            aria-pressed={isSelected}
            aria-current={isSelected ? "true" : undefined}
            aria-label={`Part ${idx + 1} of ${parts.length}, ${dims}${
              unitLabel ? " " + unitLabel : ""
            }, ${holeCount} hole${holeCount === 1 ? "" : "s"}`}
            onClick={() => setSelectedIdx(idx)}
            className={cn(
              "relative flex flex-col items-center rounded-lg border p-2.5 text-left transition-colors",
              isSelected
                ? "ring-2 ring-blue-500 bg-blue-50 border-blue-500 dark:bg-blue-950/30 dark:border-blue-500"
                : "border-border hover:bg-muted/50 dark:border-slate-700"
            )}
          >
            <div
              className={cn(
                "relative w-[80px] h-[80px] rounded bg-muted/60 dark:bg-muted/40 flex items-center justify-center",
                isSelected
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-slate-600 dark:text-slate-400"
              )}
            >
              <PartThumbnail part={part} svgSize={80} strokeWidth={1.2} />
              <HoleBadge count={holeCount} />
            </div>
            <span
              className={cn(
                "mt-1.5 text-xs font-medium",
                isSelected ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"
              )}
            >
              {dims}
            </span>
            <span className="text-[10px] text-muted-foreground">Part {idx + 1}</span>
          </button>
        )
      })}
    </div>
  )
}

interface CenterPreviewProps {
  selectedPart: DxfPartCandidate | undefined
  selectedIdx: number
  total: number
}

export function CenterPreview({ selectedPart, selectedIdx, total }: CenterPreviewProps) {
  const selectedHoleCount = selectedPart?.polygon.holes.length ?? 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Preview
        </span>
        <HoleCountChip count={selectedHoleCount} />
      </div>
      {selectedPart ? (
        <LargePreview polygon={selectedPart.polygon} bbox={selectedPart.bbox} svgSize={320} />
      ) : null}
      <p className="text-xs text-muted-foreground text-center">
        Part {selectedIdx + 1} of {total}
      </p>
    </div>
  )
}
