import type { CreateMaterialType, MaterialType, UpdateMaterialType } from "@/src/entities"

export interface IMaterialTypeRepository {
  getAll(): Promise<MaterialType[]>
  getByIds(ids: string[]): Promise<MaterialType[]>
  getNames(): Promise<Pick<MaterialType, "id" | "name">[]>
  create(input: CreateMaterialType): Promise<MaterialType>
  update(id: string, patch: UpdateMaterialType): Promise<MaterialType>
  delete(id: string): Promise<void>
}
