// TypeScript mirror of `rf_layout::domain::{PackRequest, PackResult}`
// plus their transitively-referenced types.
//
// These structs are `#[serde(rename_all = "camelCase")]` on the Rust
// side, so the wire format is already camelCase — no serde aliases
// are relied upon here (the Rust types accept a few aliases like
// `kerf`/`spacing` for `clearance` and `demand` for `quantity`, but
// the TypeScript side always emits the canonical camelCase names).
//
// Source of truth: engine/crates/rf-layout/src/domain/{request,result}.rs.
// When those change, these types need to move in lockstep.

export interface Point2D {
  x: number
  y: number
}

export type BinKind = "fresh" | "remnant"

export type UnitSystem = "inch" | "mm"

export interface Bin {
  binId: string
  width: number
  height: number
  kind: BinKind
  priority?: number | null
}

export interface ShapeSpec {
  kind: string
  // Rust side: `HashMap<String, serde_json::Value>`.
  params: Record<string, unknown>
}

export type GrainAxis = "width" | "length" | "none"

export interface Part {
  shapeId: string
  quantity: number
  /**
   * Pre-built polygon vertices in part-local coords. Reserved for
   * raw-geometry callers (DXF imports, hand-drawn shapes). Auto-nest
   * spec-able shapes (rect, circle, trapezoid, ngon, sector) ship
   * `shapeSpec` only and rely on Rust to materialise the polygon at
   * pack time. See `engine/crates/rf-layout/src/application/shape_builder.rs`.
   */
  polygon?: Point2D[]
  shapeSpec?: ShapeSpec | null
  allowRotation: boolean
  grainAxis?: GrainAxis | null
  difficulty?: number | null
  /**
   * Caller-owned opaque label echoed verbatim onto every `Placement`
   * the Rust pipeline produces for this shape. AutoNest tags
   * placements with the part number ("G2") or a generated letter
   * ("A", "B", "C…"). Rust never inspects, mutates, or fabricates
   * the value.
   */
  tag?: string | null
}

export interface OperatorProfile {
  skills: string[]
  maxDifficulty: number
}

export type PackMode = "fast" | "balanced" | "thorough"

/**
 * pack-cli backend engine selector. Mirrors `rf_layout::domain::PackEngine`.
 *
 * - `default` — `pack_lbf_lns`: polygon-aware LBF + LNS refinement (production default).
 * - `lbf` — constructive LBF only, no LNS. Faster, lower density.
 * - `legacy` — pre-Phase-3 `pack()`. Retained for benches + debug.
 */
export type PackEngine = "default" | "lbf" | "legacy"

/**
 * Render strategy for cone (sector) shapes. Mirrors
 * `ConeStrategyKind` in `rf-layout/src/application/cone_strategy.rs`.
 *
 * - `convexWedge`: cones display as solid wedges when the pack
 *   polygon is also the convex hull.
 * - `annularSector`: cones display as the real annular crescent
 *   (high-fidelity render of what the operator will cut).
 *
 * Absent → Rust default (`annularSector`).
 */
export type ConeStrategy = "convexWedge" | "annularSector"

/**
 * Collision polygon for cone (sector) shapes. Mirrors
 * `ConePackingMode` in `rf-layout/src/application/cone_strategy.rs`.
 *
 * - `convexHull`: conservative default; jagua collides against the
 *   convex hull and may expose it as `Placement.packPolygon`.
 * - `annularSector`: opt-in precise mode; jagua collides against the
 *   real concave annular sector so cones can nest into concavities.
 */
export type ConePackingMode = "convexHull" | "annularSector"

/**
 * Post-pack scrap-extraction pipeline. Mirrors `ScrapStrategyKind`
 * in `rf-layout/src/application/scrap_strategy.rs`.
 *
 * - `legacy`: bin-level Clipper diff plus inscribed-rect classification only.
 * - `twoSignal`: adds per-part `bbox(polygon) − polygon` shape-trapped
 *   crescents on top of the bin-level diff. Cones, ellipses, ngons,
 *   triangles, stars, rings render their corner waste explicitly.
 *
 * Absent → Rust default (`twoSignal`).
 */
export type ScrapStrategy = "legacy" | "twoSignal"

/**
 * Algorithm the active scrap pipeline uses to inscribe reusable
 * rectangles in the bin's free space. Mirrors
 * `OffcutExtractionStrategyKind` in
 * `rf-layout/src/application/offcut_extraction_strategy.rs`.
 *
 * Absent → Rust default (`greedyMaxRect`).
 */
export type OffcutExtractionStrategy = "greedyMaxRect"

export interface PackRequest {
  bins: Bin[]
  clearance: number
  items: Part[]
  operatorProfile?: OperatorProfile | null
  mode?: PackMode | null
  engine?: PackEngine | null
  timeBudgetMs?: number | null
  improvementBudgetMs?: number | null
  seed?: number | null
  units?: UnitSystem
  coneStrategy?: ConeStrategy
  conePackingMode?: ConePackingMode
  scrapStrategy?: ScrapStrategy
  offcutExtractionStrategy?: OffcutExtractionStrategy
  /**
   * When true (default), Rust pre-places every rect-shaped item via a
   * deterministic greedy warm-start before jagua's probabilistic LBF
   * sampler runs. Set false to compare timing against the legacy
   * probabilistic-only pipeline. Absent → Rust default (true).
   */
  useWarmStart?: boolean
}

export interface Placement {
  shapeId: string
  instanceIndex: number
  binId: string
  x: number
  y: number
  rotationRad: number
  polygon: Point2D[]
  width: number
  height: number
  difficulty?: number | null
  /**
   * Echo of the source `Part.tag` for this `shapeId`. Untagged parts
   * yield untagged placements (`undefined`).
   */
  tag?: string | null
  /**
   * Transformed pack polygon — the surface jagua actually collided
   * on. Populated only when it differs from `polygon` (today: the
   * cone convex-hull overlay in default packing).
   */
  packPolygon?: Point2D[]
}

/**
 * Whether an offcut rectangle meets the reusable-stock thresholds.
 * Mirrors `rf_layout::domain::result::OffcutKind`.
 */
export type OffcutKind = "reusable" | "scrap"

/**
 * One axis-aligned offcut rectangle extracted from a `BinResult`'s
 * `freeRegions` polygons via the Rust inscribed-rect algorithm,
 * classified against the reusable-stock thresholds. AutoNest paints
 * `reusable` in amber and `scrap` in red.
 */
export interface ClassifiedOffcut {
  binId: string
  x: number
  y: number
  width: number
  height: number
  kind: OffcutKind
}

export interface BinResult {
  binId: string
  usedArea: number
  wasteArea: number
  occupiedWidth: number
  occupiedHeight: number
  /** Ratio of placed item area to bin stock area, 0..1. */
  efficiency: number
  /** Invariant: scrapRatio == 1.0 - efficiency (within f64 epsilon). */
  scrapRatio: number
  /**
   * Boolean-difference output: bin polygon minus the union of placed
   * polygons in this bin. CCW-wound, bin-local coords. AutoNest paints
   * these as scrap polygons for irregular waste regions (cone/trapezoid
   * mixes). May be empty when the post-pack extractor didn't run.
   */
  freeRegions: Point2D[][]
  /**
   * Axis-aligned reusable/scrap rectangles inscribed inside
   * `freeRegions`. May be empty when the post-pack extractor didn't run.
   */
  offcuts: ClassifiedOffcut[]
}

export interface PackResult {
  placements: Placement[]
  placedCount: number
  overflowCount: number
  perBin: BinResult[]
  totalUsedArea: number
  totalWasteArea: number
  /** Workspace-wide utilization, 0..1. */
  overallDensity: number
  /** Wall-clock time spent packing, populated by the orchestrator. */
  runTimeMs?: number | null
}

export const PACK_MODE_BUDGETS_MS = {
  fast: 2_000,
  balanced: 10_000,
  thorough: 30_000,
} as const
