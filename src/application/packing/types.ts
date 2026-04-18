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

export interface PackRequest {
  bins: Bin[]
  clearance: number
  items: Part[]
  operatorProfile?: {
    skills: string[]
    maxDifficulty: number
  }
  mode?: "fast" | "balanced" | "thorough"
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
}

export interface PackProgress {
  jobId: string
  phase: "warmup" | "metaheuristic" | "polishing"
  iteration: number
  elapsedMs: number
  estimatedRemainingMs?: number
  canFinalize: boolean
  bestLayoutSoFar: PackResult
}

export const PACK_MODE_BUDGETS_MS = {
  fast: 2_000,
  balanced: 10_000,
  thorough: 30_000,
} as const
