import type { Supplier, CreateSupplier, UpdateSupplier } from "@/src/entities"

export interface ISuppliersRepository {
  findById(id: string): Promise<Supplier | null>
  findAll(userId: string): Promise<Supplier[]>
  findActive(userId: string): Promise<Supplier[]>
  findPreferred(userId: string): Promise<Supplier[]>
  create(data: CreateSupplier): Promise<Supplier>
  update(id: string, data: UpdateSupplier): Promise<Supplier>
  delete(id: string): Promise<void>
}
