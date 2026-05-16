import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import type { LayoutModel, PlacedPart, RenderShape } from "./layout-model"
import type { ManualPlacement } from "./free-roam-collision"

function templateToRenderShape(template: PartTemplate): RenderShape {
  // Explicit override wins — shape-registry templates set this so
  // new shapes don't need a case in this switch.
  if (template.renderShape) return template.renderShape
  switch (template.partType) {
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
 * Translate a template-local polygon (bbox anchored at 0, 0) into
 * sheet space at the placement's position + rotation. Mirrors the
 * math in `free-roam-collision.ts` + `free-roam-regions.ts` so all
 * three paths agree on where a part's vertices actually land.
 */
function templatePolygonToSheet(
  template: PartTemplate,
  placement: ManualPlacement,
  width: number,
  height: number
): Array<{ x: number; y: number }> | undefined {
  if (!template.polygon || template.polygon.outer.length < 3) return undefined
  return localPointsToSheet(template.polygon.outer, placement, width, height)
}

/**
 * Same transform as `templatePolygonToSheet`, applied to every inner
 * hole loop. Returns `undefined` when the template has no holes so
 * `PlacedPart.holes` stays absent (hole-blind consumers ignore it).
 */
function templateHolesToSheet(
  template: PartTemplate,
  placement: ManualPlacement,
  width: number,
  height: number
): Array<Array<{ x: number; y: number }>> | undefined {
  const templateHoles = template.polygon?.holes
  if (!templateHoles || templateHoles.length === 0) return undefined
  const holes: Array<Array<{ x: number; y: number }>> = []
  for (const ring of templateHoles) {
    if (ring.length < 3) continue
    holes.push(localPointsToSheet(ring, placement, width, height))
  }
  return holes.length > 0 ? holes : undefined
}

function localPointsToSheet(
  points: ReadonlyArray<{ x: number; y: number }>,
  placement: ManualPlacement,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const cx = placement.x + width / 2
  const cy = placement.y + height / 2
  const cos = Math.cos(placement.rotationRad)
  const sin = Math.sin(placement.rotationRad)
  return points.map((p) => {
    const dx = p.x - width / 2
    const dy = p.y - height / 2
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos }
  })
}

/**
 * True when the previous PlacedPart ref's visual inputs all match the
 * current placement + resolved template fields. Polygon vertices are
 * derived deterministically from (placement.x, y, rotationRad,
 * template), so checking position + size + label + specIndex + every
 * template-sourced field is a sufficient identity for the renderer.
 *
 * Includes `partNumber`, `renderShape`, and the optional geometry
 * fields (`diameter`, `topWidth`, `bottomWidth`, `innerRadius`,
 * `outerRadius`, `arcDegrees`) so a mid-session template edit (e.g.
 * a trapezoid whose `topWidth` shifts but bbox stays the same) busts
 * the cache and re-renders the part with the new geometry. Polygon
 * verts aren't compared directly — any non-trivial polygon edit
 * shifts at least one of the geometry fields above.
 */
function canReusePart(
  prev: PlacedPart,
  template: PartTemplate,
  placement: ManualPlacement,
  width: number,
  height: number,
  label: string,
  specIndex: number,
  renderShape: PlacedPart["renderShape"]
): boolean {
  return (
    prev.shapeId === template.id &&
    prev.partNumber === template.partNumber &&
    prev.renderShape === renderShape &&
    prev.x === placement.x &&
    prev.y === placement.y &&
    prev.rotationRad === placement.rotationRad &&
    prev.specIndex === specIndex &&
    prev.label === label &&
    prev.width === width &&
    prev.height === height &&
    prev.diameter === template.diameter &&
    prev.topWidth === template.topWidth &&
    prev.bottomWidth === template.bottomWidth &&
    prev.innerRadius === template.innerRadius &&
    prev.outerRadius === template.outerRadius &&
    prev.arcDegrees === template.arcDegrees &&
    // Hole-count signal: add/remove invalidates the memo. In-place
    // hole edits violate React's immutable-update convention and fall
    // outside the same identity contract polygon-vertex edits already
    // sit under (see method docstring).
    (prev.holes?.length ?? 0) === (template.polygon?.holes?.length ?? 0)
  )
}

function buildPlacedPart(
  template: PartTemplate,
  placement: ManualPlacement,
  width: number,
  height: number,
  label: string,
  specIndex: number,
  renderShape: PlacedPart["renderShape"]
): PlacedPart {
  return {
    id: placement.id,
    shapeId: template.id,
    partNumber: template.partNumber,
    label,
    renderShape,
    specIndex,
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
    polygon: templatePolygonToSheet(template, placement, width, height),
    holes: templateHolesToSheet(template, placement, width, height),
  }
}

/**
 * Build the LayoutModel the Konva renderer consumes from the current
 * parts queue + manual placements. Templates are looked up once;
 * placements missing a template (e.g. after template deletion) are
 * skipped rather than throwing — the operator doesn't need a stack
 * trace for a detached placement.
 *
 * Pass `previousPartsById` (a stable Map held by the caller) to reuse
 * `PlacedPart` object references for placements whose visual inputs
 * haven't changed since the previous build (issue #117 phase 3). The
 * Map is updated in place — entries for placements that no longer
 * exist are evicted, and the new layout's parts are written back so
 * the next call sees them. `KonvaSheetRenderer.PartShape` is wrapped
 * in `React.memo` and relies on stable refs to skip reconciliation of
 * stationary parts during drag.
 */
export function buildFreeRoamLayout(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  tagByTemplateId: Map<string, string>,
  previousPartsById?: Map<string, PlacedPart>
): LayoutModel {
  const byId = new Map(parts.map((p) => [p.id, p]))
  let specIndex = 0
  const indexByTemplate = new Map<string, number>()
  const mappedParts: PlacedPart[] = []
  const liveIds = new Set<string>()
  for (const placement of placements) {
    const template = byId.get(placement.templateId)
    if (!template) continue
    liveIds.add(placement.id)
    if (!indexByTemplate.has(template.id)) {
      indexByTemplate.set(template.id, specIndex++)
    }
    const idx = indexByTemplate.get(template.id) ?? 0
    const width = template.width ?? template.diameter ?? 12
    const height = template.length ?? template.height ?? template.diameter ?? 12
    const label = tagByTemplateId.get(template.id) ?? template.label

    const renderShape = templateToRenderShape(template)
    const prev = previousPartsById?.get(placement.id)
    const part =
      prev != null &&
      canReusePart(prev, template, placement, width, height, label, idx, renderShape)
        ? prev
        : buildPlacedPart(template, placement, width, height, label, idx, renderShape)
    mappedParts.push(part)
  }

  if (previousPartsById != null) {
    for (const id of previousPartsById.keys()) {
      if (!liveIds.has(id)) previousPartsById.delete(id)
    }
    for (const part of mappedParts) previousPartsById.set(part.id, part)
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
