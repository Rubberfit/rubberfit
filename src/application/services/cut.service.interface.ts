import type { Cut, Roll } from "@/src/entities"

export interface WasteStats {
  averageWastePercentage: number
  totalWasteSqft: number
  totalMaterialUsed: number
}

export interface WasteTrend {
  period: string
  wastePercentage: number
}

export interface CutRollInfo {
  material_type: string
  location: string
  cost_per_sqft?: number
  width?: number
  thickness?: number
}

export interface CutWithRoll extends Cut {
  roll?: CutRollInfo
}

export interface OptimizeCutRequirements {
  materialType: string
  width: number
  length: number
  quantity: number
  thickness?: number
}

export interface OptimizeCutRecommendation {
  roll: Roll
  total_length_needed: number
  material_used_sqft: number
  waste_sqft: number
  waste_percentage: number
  remaining_length_after: number
  remaining_value_after: number
  score: number
}

export interface OptimizeCutResult {
  recommendations: OptimizeCutRecommendation[]
  message?: string
}

export interface ICutService {
  recordCut(cut: Omit<Cut, "id" | "user_id" | "created_at">): Promise<Cut>
  getCutHistory(limit?: number): Promise<Cut[]>
  getCutsByRoll(rollId: string): Promise<Cut[]>
  getCutsThisWeek(): Promise<Cut[]>
  getCutsThisMonth(): Promise<Cut[]>
  getWasteStats(): Promise<WasteStats>
  getAllCuts(): Promise<Cut[]>
  getTotalMaterialUsedThisWeek(): Promise<number>
  getCutsGrowthPercentage(): Promise<number>
  getCutsByDateRange(from: Date, to: Date): Promise<Cut[]>
  getMonthlyWastePercentages(): Promise<{ waste_percentage: number }[]>
  getWasteTrendByWeek(weeks: number): Promise<WasteTrend[]>
  getWasteImprovementPercentage(): Promise<number>
  optimizeCut(requirements: OptimizeCutRequirements): Promise<OptimizeCutResult>
  getCutsByDateRangeWithRolls(
    from: Date,
    to?: Date,
    options?: { ascending?: boolean }
  ): Promise<CutWithRoll[]>
  getRecentCutsWithRolls(limit: number): Promise<CutWithRoll[]>
}
