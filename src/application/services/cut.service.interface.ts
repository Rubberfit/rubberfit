import type { Cut } from "@/src/infrastructure/models/supabase"

export interface WasteStats {
  averageWastePercentage: number
  totalWasteSqft: number
  totalMaterialUsed: number
}

export interface WasteTrend {
  period: string
  wastePercentage: number
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
}
