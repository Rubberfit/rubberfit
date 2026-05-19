import type {
  CreateMaterialSupplierProps,
  MaterialSupplier,
} from "@/src/entities/material-supplier"
import type { Money } from "@/src/entities/value-objects/money"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Per-tenant pricing service. Wraps the material_suppliers aggregate
 * with strict pricing discipline (mirrors `MaterialSupplier` entity):
 *
 * - `updatePricing` triggers a real price change — the orchestrating
 *   use-case (when one lands) must append a `price_history` row using
 *   the pre-change cost. The entity rejects no-op costs to keep that
 *   discipline enforceable.
 * - `updatePricingWindow` adjusts effective/expiration dates without
 *   touching cost — no price_history.
 * - `updateDetails` covers metadata only.
 *
 * `setPreferredForMaterial` is non-atomic — it flips the current
 * preferred(s) off, then flips the target on. Same semantics as the
 * legacy method it replaces; bringing it under a single DB transaction
 * is a follow-up.
 */
export interface IMaterialSupplierService {
  getById(id: string): Promise<MaterialSupplier>
  getActiveLinks(): Promise<MaterialSupplier[]>
  getByMaterialType(materialTypeId: string): Promise<MaterialSupplier[]>
  getBySupplier(supplierId: string): Promise<MaterialSupplier[]>
  getPreferredForMaterialType(materialTypeId: string): Promise<MaterialSupplier | null>

  createLink(props: CreateMaterialSupplierProps): Promise<MaterialSupplier>

  updateDetails(
    id: string,
    updates: {
      supplierMaterialCode: string | null
      minimumOrderSqm: number
      leadTimeDays: number
      preferredSupplier: boolean
      notes: string | null
    },
    actor: ProfileId
  ): Promise<MaterialSupplier>

  updatePricing(
    id: string,
    newCost: Money,
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    actor: ProfileId
  ): Promise<MaterialSupplier>

  updatePricingWindow(
    id: string,
    newEffectiveDate: Date,
    newExpirationDate: Date | null,
    actor: ProfileId
  ): Promise<MaterialSupplier>

  deactivate(id: string, actor: ProfileId): Promise<MaterialSupplier>
  reactivate(id: string, actor: ProfileId): Promise<MaterialSupplier>
  softDelete(id: string, actor: ProfileId): Promise<MaterialSupplier>

  /**
   * Marks `supplierId` as the preferred supplier for `materialTypeId`,
   * flipping any other link to non-preferred. Returns the target link.
   * Throws if no link exists for the (materialTypeId, supplierId) pair.
   */
  setPreferredForMaterial(
    materialTypeId: string,
    supplierId: string,
    actor: ProfileId
  ): Promise<MaterialSupplier>
}
