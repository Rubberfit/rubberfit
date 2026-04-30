import type { MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"

export interface IMaterialSuppliersRepository {
  /**
   * Returns every active material-supplier link with the joined
   * `material_type` and `supplier` rows. Used by the pricing dashboard
   * to render the comparison table.
   */
  getActiveWithDetails(): Promise<MaterialSupplierWithDetails[]>
}
