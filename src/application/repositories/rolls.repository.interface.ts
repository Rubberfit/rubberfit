import type { Roll } from "@/src/infrastructure/models/database.types"

export interface IRollsRepository {
  getAllRolls(): Promise<Roll[]>
  getActiveRolls(): Promise<Roll[]>
  getRollById(id: string): Promise<Roll>
  addRoll(roll: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">): Promise<Roll>
  updateRoll(id: string, updates: Partial<Roll>): Promise<Roll>
  markAsDepleted(id: string): Promise<Roll>
  markRollDepleted(id: string): Promise<Roll>
  getInventoryValue(): Promise<number>
  searchRolls(query: string): Promise<Roll[]>
  getLowStockCount(): Promise<number>
  deleteRoll(id: string): Promise<void>
  getRecentRolls(limit: number): Promise<Roll[]>
  getRecentlyUpdatedRolls(limit: number): Promise<Roll[]>
  existsByMaterialType(materialTypeName: string): Promise<boolean>
  getRollMaterialTypeMap(): Promise<Map<string, string>>
  bulkAddRolls(
    rolls: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">[],
    batchSize?: number
  ): Promise<{ imported: number; total: number }>
  getInventoryGrowthPercentage(): Promise<number>
  getThicknessesByMaterialType(materialType: string): Promise<number[]>
}
