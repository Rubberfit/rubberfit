import type { Point2D } from "@/nesting/types"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { ManualPlacement } from "./free-roam-collision"
import {
  type ClipperPath,
  type SideGapBbox,
  computeEnvelopeWasteForPlacement,
  placementToSheetPolygon,
  polyBbox,
  toClipperPath,
} from "./free-roam-regions"

/**
 * Per-placement geometry memoized across drag ticks. The dragged
 * placement re-encodes; everyone else hits the cache.
 *
 *  - `geomKey` is a fingerprint of the placement's resolved geometry.
 *    When it matches, every derived field is reusable.
 *  - `sheetPoly`, `sheetPath`, `bbox` cover the inputs every waste-pass
 *    needs (envelope, pocket, gap).
 *  - `envelopeWaste` is the per-placement Clipper diff result —
 *    stable as long as the placement geometry hasn't changed.
 */
interface PlacementCacheEntry {
  geomKey: string
  sheetPoly: Point2D[]
  sheetPath: ClipperPath
  bbox: SideGapBbox
  envelopeWaste: Point2D[][]
}

/**
 * Mutable cache held in a `useState` lazy initializer by
 * `free-roam-content.tsx` (the reference stays stable for the
 * component's lifetime; we never call setState). Entries persist
 * across renders; sync runs synchronously inside
 * `computeAdaptiveRegions` so the cache is always consistent with
 * the inputs the caller just passed in.
 *
 * Stock changes do not invalidate per-placement entries — stock only
 * feeds the pocket and gap passes, which always recompute.
 */
export interface RegionCache {
  perPlacement: Map<string, PlacementCacheEntry>
}

export function makeRegionCache(): RegionCache {
  return { perPlacement: new Map() }
}

/**
 * Per-template fingerprint built from the immutable geometry fields a
 * placement actually uses. Templates don't mutate after creation but
 * the user can swap a placement to a different template id; that swap
 * surfaces here as a different fingerprint -> cache miss.
 *
 * Polygon vertices are rounded to 1e-4" before hashing, matching the
 * rest of the file's int scaling tolerance. `polyLen` alone collides
 * (two different 24-vertex polygons with different geometry would
 * read as identical), so the full vertex list is in the key.
 */
function buildTemplateGeomKey(template: PartTemplate): string {
  const w = template.width ?? template.diameter ?? 12
  const h = template.length ?? template.height ?? template.diameter ?? 12
  const d = template.diameter ?? 0
  const polyHash = template.polygon
    ? template.polygon.map((p) => `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)}`).join("|")
    : ""
  return `${template.id}|${template.partType}|${w}|${h}|${d}|${polyHash}`
}

function buildPlacementGeomKey(placement: ManualPlacement, templateGeomKey: string): string {
  const x = Math.round(placement.x * 1e4)
  const y = Math.round(placement.y * 1e4)
  const r = Math.round(placement.rotationRad * 1e6)
  return `${templateGeomKey}|${x}|${y}|${r}`
}

/**
 * Bring the cache in line with the current placement set. Recompute
 * any entry whose geomKey doesn't match (new placement, moved
 * placement, or template swap), evict entries for placements that no
 * longer exist, and return the live entries map for the caller.
 *
 * Pure with respect to inputs — calling twice in a row with the same
 * arguments produces the same result and the second call hits 100%
 * cache. Safe to invoke during render in React 19's concurrent mode
 * because all writes are fully keyed by the current call's inputs.
 */
export function syncRegionCache(
  cache: RegionCache,
  placements: ReadonlyArray<ManualPlacement>,
  parts: ReadonlyArray<PartTemplate>
): Map<string, PlacementCacheEntry> {
  const templateById = new Map(parts.map((p) => [p.id, p]))
  const templateKeys = new Map<string, string>()
  for (const part of parts) templateKeys.set(part.id, buildTemplateGeomKey(part))

  const live = new Map<string, PlacementCacheEntry>()
  const liveIds = new Set<string>()

  for (const placement of placements) {
    liveIds.add(placement.id)
    const template = templateById.get(placement.templateId)
    const templateKey = templateKeys.get(placement.templateId)
    if (template == null || templateKey == null) continue

    const geomKey = buildPlacementGeomKey(placement, templateKey)
    const cached = cache.perPlacement.get(placement.id)
    if (cached != null && cached.geomKey === geomKey) {
      live.set(placement.id, cached)
      continue
    }

    const sheetPoly = placementToSheetPolygon(placement, template)
    if (sheetPoly.length < 3) {
      cache.perPlacement.delete(placement.id)
      continue
    }
    const entry: PlacementCacheEntry = {
      geomKey,
      sheetPoly,
      sheetPath: toClipperPath(sheetPoly),
      bbox: polyBbox(sheetPoly),
      envelopeWaste: computeEnvelopeWasteForPlacement(placement, template),
    }
    cache.perPlacement.set(placement.id, entry)
    live.set(placement.id, entry)
  }

  // Evict entries for placements that are no longer present.
  for (const id of cache.perPlacement.keys()) {
    if (!liveIds.has(id)) cache.perPlacement.delete(id)
  }

  return live
}
