import type { MaterialSupplier } from "@/src/entities/material-supplier"
import type { MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"

/**
 * Material-suppliers persistence boundary. Mixed-return interface during
 * the DDD migration:
 *
 * - Entity-typed methods (`findById`, `findActive`, `findByMaterialType`,
 *   `findBySupplier`, `findPreferredForMaterialType`, `insert`, `update`)
 *   are the canonical surface used by the new `MaterialSupplierService`.
 * - `getActiveWithDetails()` returns the legacy joined raw-row shape and
 *   is retained for the pricing-page surface, which expects
 *   `material_type` / `supplier` joins on each row. It is retired with
 *   the pricing-page UI migration, not in this PR.
 */
export interface IMaterialSuppliersRepository {
  // ─── Entity-typed (new DDD surface) ───────────────────────────────────
  findById(id: string): Promise<MaterialSupplier>
  findActive(): Promise<MaterialSupplier[]>
  findByMaterialType(materialTypeId: string): Promise<MaterialSupplier[]>
  findBySupplier(supplierId: string): Promise<MaterialSupplier[]>
  findPreferredForMaterialType(materialTypeId: string): Promise<MaterialSupplier | null>
  insert(link: MaterialSupplier): Promise<MaterialSupplier>
  update(link: MaterialSupplier): Promise<MaterialSupplier>

  // ─── Legacy joined shape (pricing page) ───────────────────────────────
  /**
   * @deprecated Returns the raw-row shape with `material_type` / `supplier`
   * joins. Used only by `pricingPageService`. Migrate to entity-typed
   * reads when the pricing page UI is rewritten.
   */
  getActiveWithDetails(): Promise<MaterialSupplierWithDetails[]>
}
