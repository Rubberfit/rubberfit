import type { CreateCut, Cut, Roll } from "@/src/entities"

export interface WasteStats {
  averageWastePercentage: number
  totalWasteSqmm: number
  totalMaterialUsedSqmm: number
}

export interface WasteTrend {
  period: string
  wastePercentage: number
}

export interface CutRollInfo {
  materialTypeName: string | null
  location: string | null
  costPerSqmCents?: number | null
  widthMm?: number
  thicknessMm?: number
}

export interface CutWithRoll extends Cut {
  roll?: CutRollInfo
}

export interface OptimizeCutRequirements {
  materialTypeId: string
  widthMm: number
  lengthMm: number
  quantity: number
  thicknessMm?: number
}

export interface OptimizeCutRecommendation {
  roll: Roll
  totalLengthNeededMm: number
  materialUsedSqmm: number
  wasteSqmm: number
  wastePercentage: number
  remainingLengthAfterMm: number
  remainingValueCents: number
  score: number
}

export interface OptimizeCutResult {
  recommendations: OptimizeCutRecommendation[]
  message?: string
}

export interface ICutService {
  recordCut(input: CreateCut): Promise<Cut>
  getCutHistory(limit?: number): Promise<Cut[]>
  getCutsByRoll(rollId: string): Promise<Cut[]>
  getCutsThisWeek(): Promise<Cut[]>
  getCutsThisMonth(): Promise<Cut[]>
  getWasteStats(): Promise<WasteStats>
  getAllCuts(): Promise<Cut[]>
  getTotalMaterialUsedThisWeekSqmm(): Promise<number>
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
