import { polygonArea } from "@/nesting/convex-hull"
import type { PartTemplate } from "../PresetDimensionSelector"
import type { StockConfig } from "../stock-preview-configurator"
import type { LayoutRegion } from "../layout-model"
import type { SimpleCutMetrics } from "../nesting-visualizer-types"
import type { ManualPlacement } from "./collision"

function regionsAreaSqIn(regions: readonly LayoutRegion[]): number {
  let total = 0
  for (const r of regions) {
    // Scrap regions may carry a concave waste polygon that hugs the
    // actual residue (crescent corners around discs, etc.); its
    // bbox would over-count. Prefer polygon area when present and
    // fall back to bbox for rect-shaped regions.
    if (r.polygon && r.polygon.length >= 3) {
      total += polygonArea(r.polygon)
    } else {
      total += r.width * r.height
    }
  }
  return total
}

/**
 * Derived metrics from the current manual placements + adaptive
 * regions classified by the Clipper pipeline.
 *
 * Sheet area decomposes into three buckets:
 *   - `used`     — sum of placed-part areas (discs counted by π·r²
 *                  so a square bounding box isn't over-counted)
 *   - `scrap`    — adaptive regions that failed the 11.5×12 or 6×24
 *                  reusable thresholds (red overlay)
 *   - `reusable` — remainder (amber background + classified offcut
 *                  regions), derived as `total − used − scrap` so
 *                  uncovered slivers between classified rects fall
 *                  back to "reusable" rather than leaking into waste
 *
 * Fab score = raw material efficiency (used / stock), 0..1 normalized;
 * display multiplies by 100.
 */
export function deriveManualMetrics(
  placements: ManualPlacement[],
  parts: PartTemplate[],
  stock: StockConfig,
  regions: { offcuts: readonly LayoutRegion[]; scrap: readonly LayoutRegion[] }
): SimpleCutMetrics | null {
  if (placements.length === 0) return null
  const byId = new Map(parts.map((p) => [p.id, p]))
  const totalSheetSqIn = stock.width * stock.length
  let usedSqIn = 0
  for (const p of placements) {
    const template = byId.get(p.templateId)
    if (!template) continue
    if (template.partType === "cylinder" && template.diameter) {
      const r = template.diameter / 2
      usedSqIn += Math.PI * r * r
    } else {
      const w = template.width ?? template.diameter ?? 0
      const h = template.length ?? template.height ?? template.diameter ?? 0
      usedSqIn += w * h
    }
    // Subtract gasket hole area from "used" — the bore disc and bolt
    // holes are material the cutter REMOVES, not material the part
    // consumes. Without this subtraction the same square inches get
    // counted twice (once in part bbox/area, again in the "cutout"
    // scrap regions emitted by `regions.ts`'s hole-cutout pass).
    // Codex review of the PR-C rework: "Also update metrics.ts so
    // used area is `outer − holes`; otherwise adding cutout scrap
    // double-counts bore material."
    const holes = template.polygon?.holes
    if (holes && holes.length > 0) {
      for (const hole of holes) {
        if (hole.length < 3) continue
        usedSqIn -= polygonArea(hole)
      }
    }
  }
  if (usedSqIn < 0) usedSqIn = 0
  const scrapSqIn = regionsAreaSqIn(regions.scrap)
  // Clamp scrap so floating-point drift + region overlap can't push
  // reusable negative when the sheet is fully occupied by parts+scrap.
  const cappedScrapSqIn = Math.min(scrapSqIn, Math.max(0, totalSheetSqIn - usedSqIn))
  const reusableSqIn = Math.max(0, totalSheetSqIn - usedSqIn - cappedScrapSqIn)

  const usedSqFt = usedSqIn / 144
  const scrapSqFt = cappedScrapSqIn / 144
  const reusableSqFt = reusableSqIn / 144
  const efficiency = totalSheetSqIn > 0 ? usedSqIn / totalSheetSqIn : 0

  return {
    partsCompleted: placements.length,
    cutPieces: placements.length,
    materialUsedSqFt: Number(usedSqFt.toFixed(4)),
    reusableOffsetSqFt: Number(reusableSqFt.toFixed(4)),
    scrapSqFt: Number(scrapSqFt.toFixed(4)),
    fabScore: efficiency,
    offcutPieces: [],
  }
}
