import type { MaterialType } from "@/src/entities"

export interface IMaterialTypeService {
  getAll(): Promise<MaterialType[]>
  getByIds(ids: string[]): Promise<MaterialType[]>
  getNames(): Promise<Pick<MaterialType, "id" | "name">[]>
  getTopByCost(limit: number): Promise<MaterialType[]>
  create(
    material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">
  ): Promise<MaterialType>
  update(id: string, updates: Partial<MaterialType>): Promise<MaterialType>
  delete(id: string): Promise<void>
}
