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
  overallDensity?: number
  runTimeMs?: number
}

export const PACK_MODE_BUDGETS_MS = {
  fast: 2_000,
  balanced: 10_000,
  thorough: 30_000,
} as const
