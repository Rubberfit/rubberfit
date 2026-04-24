export interface Point2D {
  x: number
  y: number
}

export interface ShapeSpec {
  kind: "rect" | "circle" | "ngon" | "trapezoid" | "sector" | "dxf" | "svg" | "custom"
  params: Record<string, number | string>
}

export interface Part {
  shapeId: string
  quantity: number
  polygon: Point2D[]
  shapeSpec?: ShapeSpec
  allowRotation: boolean
  grainAxis?: "width" | "length" | "none"
  difficulty?: number
}

export interface Bin {
  binId: string
  width: number
  height: number
  kind: "fresh" | "remnant"
  priority?: number
}

/**
 * pack-cli backend engine selector.
 *
 * - `default` — `pack_lbf_lns`: polygon-aware LBF + LNS refinement
 *   (Phase 3 pipeline, production default).
 * - `lbf` — constructive LBF only, no LNS. Faster, lower density.
 * - `legacy` — pre-Phase-3 `pack()`. Retained for benches + debug.
 *
 * Omitting falls back to the `RF_ENGINE` env var server-side,
 * then to `default`.
 */
export type PackEngine = "default" | "lbf" | "legacy"

export interface PackRequest {
  bins: Bin[]
  clearance: number
  items: Part[]
  operatorProfile?: {
    skills: string[]
    maxDifficulty: number
  }
  mode?: "fast" | "balanced" | "thorough"
  engine?: PackEngine
  timeBudgetMs?: number
  improvementBudgetMs?: number
  seed?: number
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
  difficulty?: number
}

export interface BinResult {
  binId: string
  usedArea: number
  wasteArea: number
  occupiedWidth: number
  occupiedHeight: number
  efficiency: number
}

export interface PackResult {
  placements: Placement[]
  placedCount: number
  overflowCount: number
  perBin: BinResult[]
  totalUsedArea: number
  totalWasteArea: number
  /** Task 14: true when a caller-provided AbortSignal fired mid-search.
   *  Omitted on the wire (serde skip_serializing_if) when false. */
  wasCancelled?: boolean
  /** Task 14: total workspace utilization (0..1). */
  overallDensity?: number
  /** Task 14: wall-clock time in ms. */
  runTimeMs?: number
}

/**
 * Progress frame emitted by the Rust engine during `--stream` mode.
 *
 * Wire format: one JSON object per line on pack-cli stdout, emitted
 * only when the global incumbent strictly improves in either
 * `bestPlacedCount` or `bestActiveStockDensity`.
 *
 * Shape mirrors `rf_layout::infrastructure::search::progress::PackProgress`
 * exactly (camelCase serde). Fields are stable across Tasks 14-20.
 *
 * - `iteration`: emission-sequence counter (0 = baseline; increments per
 *   emitted frame). Not tied to raw GLS iteration count.
 * - `elapsedMs`: wall-clock ms since `pack()` started.
 * - `bestPlacedCount`: total items placed across all bins at this point.
 * - `bestActiveStockDensity`: sum of placed polygon area / sum of stock
 *   area of NON-EMPTY bins. Rises when operators close bins.
 * - `phase`: currently "explore" only (compression is identity in Task 7;
 *   Task 14 may emit "compress" later).
 */
export interface PackProgress {
  iteration: number
  elapsedMs: number
  bestPlacedCount: number
  bestActiveStockDensity: number
  phase: "explore" | "compress"
}

/**
 * Thrown when the caller aborts a pack via `AbortSignal`.
 */
export class PackingAbortedError extends Error {
  constructor(message = "Packing operation was aborted") {
    super(message)
    this.name = "PackingAbortedError"
  }
}

export const PACK_MODE_BUDGETS_MS = {
  fast: 2_000,
  balanced: 10_000,
  thorough: 30_000,
} as const
