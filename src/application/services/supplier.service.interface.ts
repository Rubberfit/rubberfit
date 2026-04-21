import type {
  CreateMaterialSupplier,
  CreateSupplier,
  MaterialSupplier,
  MaterialSupplierWithDetails,
  Supplier,
  UpdateMaterialSupplier,
  UpdateSupplier,
} from "@/src/infrastructure/models/database.types"

export interface ISupplierService {
  getAllSuppliers(): Promise<Supplier[]>
  getActiveSuppliers(): Promise<Supplier[]>
  getPreferredSuppliers(): Promise<Supplier[]>
  getSupplierById(id: string): Promise<Supplier>
  createSupplier(supplier: CreateSupplier): Promise<Supplier>
  updateSupplier(id: string, updates: UpdateSupplier): Promise<Supplier>
  deleteSupplier(id: string): Promise<boolean>
  updateSupplierRating(id: string, rating: number): Promise<Supplier>
  searchSuppliers(query: string): Promise<Supplier[]>
  linkMaterialToSupplier(
    materialSupplier: CreateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails>
  unlinkMaterialFromSupplier(materialSupplierId: string): Promise<boolean>
  updateMaterialSupplier(
    id: string,
    updates: UpdateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails>
  getSuppliersByMaterialType(materialTypeId: string): Promise<MaterialSupplierWithDetails[]>
  getMaterialsBySupplier(supplierId: string): Promise<MaterialSupplierWithDetails[]>
  getPreferredSupplierForMaterial(
    materialTypeId: string
  ): Promise<MaterialSupplierWithDetails | null>
  setPreferredSupplier(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplierWithDetails>
  checkMaterialSupplierLink(
    materialTypeId: string,
    supplierId: string
  ): Promise<MaterialSupplier | null>
  bulkCreateSuppliers(suppliers: CreateSupplier[]): Promise<Supplier[]>
  bulkLinkMaterialsToSupplier(
    materialSuppliers: CreateMaterialSupplier[]
  ): Promise<MaterialSupplier[]>
  getAllSuppliersOrdered(): Promise<Supplier[]>
  getSuppliers(options?: { filterActive?: boolean; filterPreferred?: boolean }): Promise<Supplier[]>
}
