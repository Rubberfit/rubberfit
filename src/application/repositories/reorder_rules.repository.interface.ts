import type {
  ReorderRule,
  ReorderRuleWithDetails,
  CreateReorderRule,
  UpdateReorderRule,
} from "@/src/infrastructure/models/database.types"

export interface IReorderRulesRepository {
  findById(id: string): Promise<ReorderRule | null>
  findAll(userId: string): Promise<ReorderRule[]>
  findActive(userId: string): Promise<ReorderRuleWithDetails[]>
  findByMaterialType(userId: string, materialTypeId: string): Promise<ReorderRule[]>
  create(data: CreateReorderRule): Promise<ReorderRule>
  update(id: string, data: UpdateReorderRule): Promise<ReorderRule>
  delete(id: string): Promise<void>
}
