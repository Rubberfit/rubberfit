import type { PriceHistory } from "@/src/infrastructure/models/database.types"

export interface IPriceHistoryRepository {
  findById(id: string): Promise<PriceHistory | null>
  findByMaterialSupplier(materialSupplierId: string): Promise<PriceHistory[]>
  create(data: Omit<PriceHistory, "id" | "user_id" | "created_at">): Promise<PriceHistory>
}
