import type { Roll } from "@/src/entities"

export interface BulkAddResult {
  imported: number
  total: number
}

export interface IRollService {
  getAllRolls(): Promise<Roll[]>
  getActiveRolls(): Promise<Roll[]>
  getRollById(id: string): Promise<Roll>
  addRoll(roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">): Promise<Roll>
  updateRoll(id: string, updates: Partial<Roll>): Promise<Roll>
  markAsDepleted(id: string): Promise<Roll>
  getInventoryValue(): Promise<number>
  searchRolls(query: string): Promise<Roll[]>
  getLowStockCount(): Promise<number>
  deleteRoll(id: string): Promise<void>
  getRecentRolls(limit: number): Promise<Roll[]>
  bulkAddRolls(
    rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[],
    batchSize?: number
  ): Promise<BulkAddResult>
  getInventoryGrowthPercentage(): Promise<number>
  getThicknessesByMaterialType(materialType: string): Promise<number[]>
}
