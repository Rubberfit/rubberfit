import type { PriceHistory } from "@/src/entities/price-history"
import type { PriceHistoryWithJoins } from "@/src/application/services/price-history.service.interface"

/**
 * Price-history persistence boundary. Reads are split into two
 * categories:
 *
 * - Entity-typed reads (`findByMaterialSupplier`) return
 *   `PriceHistory` instances; that's the canonical surface used by
 *   new code.
 * - Joined reads (`findByMaterialType`, `findByDateRange`,
 *   `findSignificantChanges`) keep the legacy `PriceHistoryWithJoins`
 *   shape because the dashboard UI consumes embedded supplier /
 *   material_type rows. They retire alongside the pricing-page UI
 *   rewrite, not in this PR.
 *
 * Writes are append-only — there is no `update` or `delete`.
 */
export interface IPriceHistoryRepository {
  /** Inserts a new audit row from the entity. Returns the rehydrated entity. */
  insert(entry: PriceHistory): Promise<PriceHistory>

  /** Newest first by effective_date. Caps result with `limit` if provided. */
  findByMaterialSupplier(materialSupplierId: string, limit?: number): Promise<PriceHistory[]>

  /**
   * @deprecated Joined shape kept for the pricing dashboard. Returns rows
   * for every material_supplier belonging to the given material_type
   * inside the last `daysBack` days, with the supplier row embedded.
   */
  findByMaterialType(materialTypeId: string, daysBack: number): Promise<PriceHistoryWithJoins[]>

  /**
   * @deprecated Joined shape kept for the pricing dashboard's date-range
   * selector. Rows with `created_at >= startDate`, joined with the
   * material_supplier + its material_type + supplier.
   */
  findByDateRange(startDate: Date): Promise<PriceHistoryWithJoins[]>

  /**
   * @deprecated Joined shape kept for the dashboard's alert card. Rows
   * inside the last `daysBack` days whose `price_change_percentage`
   * exceeds ±`thresholdPercentage`.
   */
  findSignificantChanges(
    thresholdPercentage: number,
    daysBack: number
  ): Promise<PriceHistoryWithJoins[]>
}
