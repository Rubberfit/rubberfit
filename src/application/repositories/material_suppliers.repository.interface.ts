import type {
  MaterialSupplier,
  MaterialSupplierWithDetails,
  CreateMaterialSupplier,
  UpdateMaterialSupplier,
} from "@/src/infrastructure/models/supabase"

export interface IMaterialSuppliersRepository {
  findById(id: string): Promise<MaterialSupplier | null>
  findAll(userId: string): Promise<MaterialSupplier[]>
  findByMaterialType(userId: string, materialTypeId: string): Promise<MaterialSupplierWithDetails[]>
  findBySupplierId(userId: string, supplierId: string): Promise<MaterialSupplierWithDetails[]>
  create(data: CreateMaterialSupplier): Promise<MaterialSupplier>
  update(id: string, data: UpdateMaterialSupplier): Promise<MaterialSupplier>
  delete(id: string): Promise<void>
}
