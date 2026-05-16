/**
 * @deprecated **BURIED 2026-05-15** (follow-up to commit `653af86d`).
 *
 * Pre-DDD raw-row CRUD over the suppliers + material_suppliers tables.
 * Originally retained so the flag-gated `inventory.ts` SDK kept
 * type-checking through the DDD cutover. The methods referenced
 * post-redesign-removed columns (`user_id`, flat `address`/`city`/…
 * fields, `default_shipping_cost`), so every write path was already
 * broken at runtime against the live schema.
 *
 * All methods now throw `NotImplementedError`. The class shape +
 * `ILegacySupplierService` interface + module-level singleton export
 * are preserved so:
 *
 *   1. `src/infrastructure/api-client/rf/inventory.ts:22` still
 *      type-checks (it imports the singleton as `legacySuppliers` and
 *      calls it on the flag-OFF branch of `NEXT_PUBLIC_USE_RUST_INVENTORY`).
 *   2. The architectural guard at
 *      `tests/architecture/no-legacy-supplier-service.test.ts` keeps
 *      passing (import-based; both files are allowlisted).
 *   3. The parity test at `tests/api-v2-inventory-parity.test.ts:59`
 *      keeps passing — it `vi.mock()`s this module, so the real
 *      throwing bodies never run in tests.
 *
 * **Use `supplierService` (DDD) for new code.** This file is one step
 * away from full deletion — that happens when `inventory.ts` drops
 * its flag-OFF branch and the architectural guard's allowlist entry
 * for `inventory.ts` becomes orphaned.
 */
import {
  type Supplier,
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
  type CreateSupplier,
  type UpdateSupplier,
  type CreateMaterialSupplier,
  type UpdateMaterialSupplier,
} from "@/src/infrastructure/models/supabase"

export interface ILegacySupplierService {
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

const BURIED_MESSAGE =
  "NotImplemented: legacySupplierService is buried — set NEXT_PUBLIC_USE_RUST_INVENTORY=true to use the Rust inventory path."

function notImplemented(): never {
  throw new Error(BURIED_MESSAGE)
}

/** @deprecated See module docstring. */
class LegacySupplierService implements ILegacySupplierService {
  async getAllSuppliers(): Promise<Supplier[]> {
    notImplemented()
  }
  async getActiveSuppliers(): Promise<Supplier[]> {
    notImplemented()
  }
  async getPreferredSuppliers(): Promise<Supplier[]> {
    notImplemented()
  }
  async getSupplierById(_id: string): Promise<Supplier> {
    notImplemented()
  }
  async createSupplier(_supplier: CreateSupplier): Promise<Supplier> {
    notImplemented()
  }
  async updateSupplier(_id: string, _updates: UpdateSupplier): Promise<Supplier> {
    notImplemented()
  }
  async deleteSupplier(_id: string): Promise<boolean> {
    notImplemented()
  }
  async updateSupplierRating(_id: string, _rating: number): Promise<Supplier> {
    notImplemented()
  }
  async searchSuppliers(_query: string): Promise<Supplier[]> {
    notImplemented()
  }
  async linkMaterialToSupplier(
    _materialSupplier: CreateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    notImplemented()
  }
  async unlinkMaterialFromSupplier(_materialSupplierId: string): Promise<boolean> {
    notImplemented()
  }
  async updateMaterialSupplier(
    _id: string,
    _updates: UpdateMaterialSupplier
  ): Promise<MaterialSupplierWithDetails> {
    notImplemented()
  }
  async getSuppliersByMaterialType(
    _materialTypeId: string
  ): Promise<MaterialSupplierWithDetails[]> {
    notImplemented()
  }
  async getMaterialsBySupplier(_supplierId: string): Promise<MaterialSupplierWithDetails[]> {
    notImplemented()
  }
  async getPreferredSupplierForMaterial(
    _materialTypeId: string
  ): Promise<MaterialSupplierWithDetails | null> {
    notImplemented()
  }
  async setPreferredSupplier(
    _materialTypeId: string,
    _supplierId: string
  ): Promise<MaterialSupplierWithDetails> {
    notImplemented()
  }
  async checkMaterialSupplierLink(
    _materialTypeId: string,
    _supplierId: string
  ): Promise<MaterialSupplier | null> {
    notImplemented()
  }
  async bulkCreateSuppliers(_suppliers: CreateSupplier[]): Promise<Supplier[]> {
    notImplemented()
  }
  async bulkLinkMaterialsToSupplier(
    _materialSuppliers: CreateMaterialSupplier[]
  ): Promise<MaterialSupplier[]> {
    notImplemented()
  }
  async getAllSuppliersOrdered(): Promise<Supplier[]> {
    notImplemented()
  }
  async getSuppliers(_options?: {
    filterActive?: boolean
    filterPreferred?: boolean
  }): Promise<Supplier[]> {
    notImplemented()
  }
}

export const legacySupplierService: ILegacySupplierService = new LegacySupplierService()
