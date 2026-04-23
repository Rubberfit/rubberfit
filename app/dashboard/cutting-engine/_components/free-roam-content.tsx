"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Polygon, Vector, testPolygonPolygon } from "sat"
import { WorkspaceColumn, WorkspaceRow } from "@/app/components/patterns/workspace-column"
import type { CutHistory, MaterialType } from "@/src/infrastructure/models/supabase"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { SimpleCutDirection } from "./NestingVisualizer"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { LayoutModel, PlacedPart, RenderShape } from "./layout-model"
import { PartsQueuePanel, type PartsFilter } from "./parts-queue-panel"
import { CanvasToolbar } from "./canvas-toolbar"
import { StrategyResultsPanel } from "./strategy-results-panel"
import KonvaSheetRenderer from "./KonvaSheetRenderer"

/** Single placement on the Free-roam canvas. Position is in sheet inches. */
interface ManualPlacement {
  /** Unique instance id. */
  id: string
  /** References a `PartTemplate.id` in the parts queue. */
  templateId: string
  x: number
  y: number
  rotationRad: number
}

function templateToRenderShape(type: string): RenderShape {
  switch (type) {
    case "cylinder":
      return "circle"
    case "cone":
      return "sector"
    case "trapezoid":
      return "trapezoid"
    default:
      return "rect"
  }
}

/**
 * Build the LayoutModel the Konva renderer consumes from the current
 * parts queue + manual placements. Templates are looked up once;
 * placements missing a template (e.g. after template deletion) are
 * skipped rather than throwing — the operator doesn't need a stack
 * trace for a detached placement.
 */
function buildFreeRoamLayout(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  tagByTemplateId: Map<string, string>
): LayoutModel {
  const byId = new Map(parts.map((p) => [p.id, p]))
  let specIndex = 0
  const indexByTemplate = new Map<string, number>()
  const mappedParts: PlacedPart[] = []
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    if (!indexByTemplate.has(template.id)) {
      indexByTemplate.set(template.id, specIndex++)
    }
    const idx = indexByTemplate.get(template.id) ?? 0
    const width = template.width ?? template.diameter ?? 12
    const height = template.length ?? template.height ?? template.diameter ?? 12
    mappedParts.push({
      id: placement.id,
      shapeId: template.id,
      partNumber: template.partNumber,
      label: tagByTemplateId.get(template.id) ?? template.label,
      renderShape: templateToRenderShape(template.partType),
      specIndex: idx,
      x: placement.x,
      y: placement.y,
      rotationRad: placement.rotationRad,
      width,
      height,
      diameter: template.diameter,
      topWidth: template.topWidth,
      bottomWidth: template.bottomWidth,
      innerRadius: template.innerRadius,
      outerRadius: template.outerRadius,
      arcDegrees: template.arcDegrees,
    })
  }
  return {
    sheetWidth: stock.width,
    sheetLength: stock.length,
    parts: mappedParts,
    offcuts: [],
    scrap: [],
    placedCount: mappedParts.length,
    overflowCount: 0,
    usedAreaSqFt: 0,
    reusableAreaSqFt: 0,
    scrapAreaSqFt: 0,
    fabScore: 0,
    source: "ts-nfp",
  }
}

/**
 * SAT polygon for a single placement, at its current position +
 * rotation, in SHEET INCH coordinates. We fan rectangles into 4
 * corners around the center (so rotation is respected), circles
 * into a 20-vertex approximation, and polygon shapes reuse the
 * template's polygon translated to the placement's origin.
 *
 * Consumers call `testPolygonPolygon(a, b)` from `sat` to test for
 * overlap.
 */
function buildPlacementPolygon(placement: ManualPlacement, template: PartTemplate): Polygon {
  const width = template.width ?? template.diameter ?? 12
  const height = template.length ?? template.height ?? template.diameter ?? 12
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)

  // Rotate a local offset (dx, dy) around the origin and translate
  // to world (sheet) coords. The outer `+ cx / cy` anchors at the
  // placement's center so rotation spins in place.
  const rot = (dx: number, dy: number): Vector =>
    new Vector(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos)

  if (template.partType === "cylinder" && template.diameter) {
    // Approximate the disc with a 20-gon — SAT handles circles
    // natively but mixing circle + polygon test routines in the
    // collider keeps the dispatch uniform. Resolution is enough
    // for pixel-scale UI correctness.
    const r = template.diameter / 2
    const pts: Vector[] = []
    const N = 20
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      pts.push(new Vector(cx + r * Math.cos(a), cy + r * Math.sin(a)))
    }
    return new Polygon(new Vector(0, 0), pts)
  }

  // Axis-aligned rectangle as 4 corners, rotated around center.
  return new Polygon(new Vector(0, 0), [
    rot(-width / 2, -height / 2),
    rot(width / 2, -height / 2),
    rot(width / 2, height / 2),
    rot(-width / 2, height / 2),
  ])
}

/**
 * Check whether moving `candidate` to `(proposedX, proposedY)` would
 * overlap any OTHER placement. Returns true when a collision is
 * found so the caller can reject the move. AABB broad-phase first
 * (cheap early-out for obvious non-overlaps), SAT narrow-phase
 * second (authoritative for rotated rects + polygons).
 */
function wouldCollide(
  candidate: ManualPlacement,
  proposedX: number,
  proposedY: number,
  others: ManualPlacement[],
  parts: PartTemplate[]
): boolean {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const candidateTemplate = byId.get(candidate.templateId)
  if (!candidateTemplate) return false
  const cw = candidateTemplate.width ?? candidateTemplate.diameter ?? 12
  const ch =
    candidateTemplate.length ?? candidateTemplate.height ?? candidateTemplate.diameter ?? 12
  const proposed: ManualPlacement = { ...candidate, x: proposedX, y: proposedY }
  const proposedPoly = buildPlacementPolygon(proposed, candidateTemplate)

  for (const other of others) {
    if (other.id === candidate.id) continue
    const otherTemplate = byId.get(other.templateId)
    if (!otherTemplate) continue
    const ow = otherTemplate.width ?? otherTemplate.diameter ?? 12
    const oh = otherTemplate.length ?? otherTemplate.height ?? otherTemplate.diameter ?? 12

    // AABB broad-phase — skip the SAT call when AABBs clearly don't
    // touch. Uses the template bounds (ignoring rotation) as a
    // conservative overestimate, so a true-negative here really means
    // no collision.
    const aMinX = proposedX
    const aMinY = proposedY
    const aMaxX = proposedX + cw
    const aMaxY = proposedY + ch
    const bMinX = other.x
    const bMinY = other.y
    const bMaxX = other.x + ow
    const bMaxY = other.y + oh
    if (aMaxX <= bMinX || bMaxX <= aMinX || aMaxY <= bMinY || bMaxY <= aMinY) continue

    const otherPoly = buildPlacementPolygon(other, otherTemplate)
    if (testPolygonPolygon(proposedPoly, otherPoly)) return true
  }
  return false
}

/**
 * Free-roam tab content — three-column CAD-style workspace. Phase A
 * is the scaffold: shared parts queue on the left, canvas placeholder
 * in the center, strategy + results panel on the right. Drag / drop,
 * snap, and real algorithm wiring land in C9 — C11.
 *
 * Parts + stock are shared with the Auto nest tab (owned by the
 * cutting-engine page). Placements will be per-tab once the canvas
 * is wired.
 */
interface FreeRoamContentProps {
  parts: PartTemplate[]
  stock: StockConfig
  materialTypes: MaterialType[]
  activeStockPreset: string | null
  selectedTemplate: PartTemplate | null
  selectedTemplates: PartTemplate[]
  safeQuantity: number
  cutDirection: SimpleCutDirection
  setCutDirection: (d: SimpleCutDirection) => void
  customCutRatioInput: string
  setCustomCutRatioInput: (v: string) => void
  customCutRatios: number[] | undefined
  requestedSqFt: number
  cutMetrics: SimpleCutMetrics | null
  onRecordCut: () => void
  isRecordingCut: boolean
  refreshKey: number
  onLoadCut: (cut: CutHistory) => void
}

export default function FreeRoamContent({
  parts,
  stock,
  selectedTemplate,
  selectedTemplates,
  safeQuantity,
  cutDirection,
  setCutDirection,
  customCutRatioInput,
  setCustomCutRatioInput,
  customCutRatios,
  requestedSqFt,
  cutMetrics,
  onRecordCut,
  isRecordingCut,
  refreshKey,
  onLoadCut,
}: FreeRoamContentProps) {
  const [partsFilter, setPartsFilter] = useState<PartsFilter>("all")
  const [placements, setPlacements] = useState<ManualPlacement[]>([])
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null)

  // Tag map — A / B / C / … per template so the canvas labels match
  // the parts queue. Uses partNumber when set (e.g. RF-000042), else
  // generated letters in selection order.
  const tagByTemplateId = useMemo(() => {
    const map = new Map<string, string>()
    let fallbackIdx = 0
    for (const part of parts) {
      if (part.partNumber) {
        map.set(part.id, part.partNumber)
      } else {
        let n = fallbackIdx++
        let tag = ""
        do {
          tag = String.fromCharCode(65 + (n % 26)) + tag
          n = Math.floor(n / 26) - 1
        } while (n >= 0)
        map.set(part.id, tag)
      }
    }
    return map
  }, [parts])

  const placedCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of placements) {
      counts[p.templateId] = (counts[p.templateId] ?? 0) + 1
    }
    return counts
  }, [placements])

  const handleAddInstance = useCallback(
    (part: PartTemplate) => {
      setPlacements((prev) => [
        ...prev,
        {
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          templateId: part.id,
          // Seed new instances at the sheet origin; drag to move
          // lands in C11c. Small rightward offset per new instance so
          // back-to-back clicks don't stack invisibly on top of each
          // other.
          x: Math.min(stock.width - 1, prev.length * 2),
          y: 0,
          rotationRad: 0,
        },
      ])
    },
    [stock.width]
  )

  const layout = useMemo(
    () => buildFreeRoamLayout(placements, parts, stock, tagByTemplateId),
    [placements, parts, stock, tagByTemplateId]
  )

  // Keyboard shortcuts for the selected placement.
  //   Delete / Backspace — remove from canvas
  //   R                  — rotate 90° clockwise
  // All guarded against editable-element targets so the operator
  // doesn't lose work while typing part dimensions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedPartId == null) return
      const t = e.target as HTMLElement | null
      const editable = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable
      if (editable) return
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault()
        setPlacements((prev) => prev.filter((p) => p.id !== selectedPartId))
        setSelectedPartId(null)
        return
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault()
        setPlacements((prev) =>
          prev.map((p) =>
            p.id === selectedPartId
              ? { ...p, rotationRad: (p.rotationRad + Math.PI / 2) % (Math.PI * 2) }
              : p
          )
        )
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedPartId])

  const handlePartDragEnd = useCallback(
    (partId: string, xIn: number, yIn: number) => {
      setPlacements((prev) => {
        const placement = prev.find((p) => p.id === partId)
        if (!placement) return prev
        const template = parts.find((t) => t.id === placement.templateId)
        const partW = template?.width ?? template?.diameter ?? 12
        const partH = template?.length ?? template?.height ?? template?.diameter ?? 12

        // Snap to grid — rounds to the nearest SNAP_STEP inch on drag
        // end so placement stays orderly without fighting the operator
        // mid-drag. Edge snap: within SNAP_EDGE inches of either
        // border, clamp flush.
        const SNAP_STEP = 1
        const SNAP_EDGE = 0.25
        const maxX = stock.width - partW
        const maxY = stock.length - partH
        const snapAxis = (v: number, max: number) => {
          if (v < SNAP_EDGE) return 0
          if (v > max - SNAP_EDGE) return Math.max(0, max)
          return Math.round(v / SNAP_STEP) * SNAP_STEP
        }
        const snappedX = Math.max(0, Math.min(maxX, snapAxis(xIn, maxX)))
        const snappedY = Math.max(0, Math.min(maxY, snapAxis(yIn, maxY)))

        // Collision check — if the snapped position would overlap
        // another placement, reject the move (React re-renders with
        // the old position, Konva snaps the dragged Group back). A
        // future commit can add a "shake" animation / toast hint.
        if (wouldCollide(placement, snappedX, snappedY, prev, parts)) {
          return prev
        }
        return prev.map((p) => (p.id === partId ? { ...p, x: snappedX, y: snappedY } : p))
      })
    },
    [parts, stock.width, stock.length]
  )

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
      <WorkspaceRow className="min-h-[560px]">
        <WorkspaceColumn column="left">
          <PartsQueuePanel
            parts={parts}
            activeFilter={partsFilter}
            onFilterChange={setPartsFilter}
            placedCounts={placedCounts}
            onAddInstance={handleAddInstance}
          />
        </WorkspaceColumn>

        <WorkspaceColumn column="center">
          <div className="flex h-full flex-col">
            <CanvasToolbar />
            <div className="relative flex-1 bg-muted/10">
              <KonvaSheetRenderer
                layout={layout}
                onPartDragEnd={handlePartDragEnd}
                selectedPartId={selectedPartId}
                onPartClick={setSelectedPartId}
                onSheetClick={() => setSelectedPartId(null)}
              />
              {parts.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    Add parts from the queue to start.
                  </div>
                </div>
              ) : placements.length === 0 ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                  <div className="rounded-md border border-border/60 bg-background/95 px-3 py-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                    Click a part to place · drag to move · click to select · R to rotate · Delete to
                    remove
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </WorkspaceColumn>

        <WorkspaceColumn column="right" scroll="y">
          <StrategyResultsPanel
            stock={stock}
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            safeQuantity={safeQuantity}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            customCutRatioInput={customCutRatioInput}
            setCustomCutRatioInput={setCustomCutRatioInput}
            customCutRatios={customCutRatios}
            requestedSqFt={requestedSqFt}
            cutMetrics={cutMetrics}
            onRecordCut={onRecordCut}
            isRecordingCut={isRecordingCut}
            refreshKey={refreshKey}
            onLoadCut={onLoadCut}
          />
        </WorkspaceColumn>
      </WorkspaceRow>
    </div>
  )
}
