import type { PriceHistory as PriceHistoryEntity } from "@/src/entities/price-history"
import type {
  MaterialSupplierWithDetails,
  PriceHistory,
} from "@/src/infrastructure/models/supabase"

// ─── Public types reused across services (kept stable for consumers) ──────

export interface PriceComparison {
  suppliers: MaterialSupplierWithDetails[]
  lowestPrice: number
  highestPrice: number
  averagePrice: number
  priceRange: number
  bestValue: MaterialSupplierWithDetails | null
}

export interface PriceTrend {
  materialTypeId: string
  supplierId: string
  currentPrice: number
  previousPrice: number
  changeAmount: number
  changePercentage: number
  trend: "increasing" | "decreasing" | "stable"
  priceHistory: PriceHistory[]
}

export interface BestPriceOption {
  supplierId: string
  supplierName: string
  materialSupplierId: string
  costPerSqft: number
  leadTimeDays: number
  minimumOrderSqft: number
  isPreferred: boolean
  lastPriceChange?: {
    date: string
    changePercentage: number
  }
}

export interface PriceBulkChange {
  materialSupplierId: string
  oldPrice?: number
  newPrice: number
  changeReason?: string
  changedBy?: string
}

export interface PriceHistoryWithJoins extends PriceHistory {
  material_supplier?: {
    supplier?: { id: string; name: string }
    material_type?: { id: string; name: string }
    material_type_id?: string
  }
}

// ─── New entity-typed service (canonical) ─────────────────────────────────

/**
 * Price-history service. All writes go through `appendPriceChange`,
 * which constructs a `PriceHistory` entity (validating cost > 0,
 * currency match, non-equal cents, and computing
 * `priceChangePercentage`) before inserting. Reads return entity
 * instances except for the three legacy joined-shape methods retained
 * for the pricing dashboard.
 *
 * The price-history table is **append-only** — no update / delete.
 * Orchestration use-cases (e.g. `UpdateMaterialPricingUseCase`) wrap
 * `appendPriceChange` alongside `materialSupplierService.updatePricing`
 * so the audit row and the cost change land together.
 */
export interface IPriceHistoryService {
  appendPriceChange(input: {
    materialSupplierId: string
    oldCostCents: number | null
    newCostCents: number
    changeReason?: string | null
    changedBy?: string | null
    effectiveDate?: Date
    notes?: string | null
  }): Promise<PriceHistoryEntity>

  /** Newest first by effective_date. */
  getHistoryFor(materialSupplierId: string, limit?: number): Promise<PriceHistoryEntity[]>

  /** @deprecated Joined shape kept for the pricing dashboard. */
  getMaterialPriceHistory(
    materialTypeId: string,
    daysBack?: number
  ): Promise<PriceHistoryWithJoins[]>

  /** @deprecated Joined shape kept for the pricing dashboard. */
  getPriceHistoryByDateRange(startDate: Date): Promise<PriceHistoryWithJoins[]>

  /** @deprecated Joined shape kept for the pricing dashboard's alert card. */
  getSignificantPriceChanges(
    thresholdPercentage?: number,
    daysBack?: number
  ): Promise<PriceHistoryWithJoins[]>
}

// ─── Legacy raw-row + analytics service (pre-DDD consumers) ───────────────

/**
 * Holds the legacy `trackPriceChange` snake_case writer plus the
 * analytics methods (`comparePrices`, `calculatePriceTrends`,
 * `getBestPrice`, `calculateValueScore`, `bulkTrackPriceChanges`) that
 * read removed columns (`cost_per_sqft`) and aren't really
 * price-history operations. They stay on a shim until the pricing
 * dashboard is rewritten on top of the entity-typed surface.
 */
export interface ILegacyPriceHistoryService {
  /** @deprecated Use `priceHistoryService.appendPriceChange` (entity-typed). */
  trackPriceChange(
    materialSupplierId: string,
    oldPrice: number | undefined,
    newPrice: number,
    changeReason?: string,
    changedBy?: string
  ): Promise<PriceHistory>
  /** @deprecated References removed `cost_per_sqft` columns. */
  comparePrices(materialTypeId: string): Promise<PriceComparison>
  /** @deprecated References removed `cost_per_sqft` columns. */
  calculatePriceTrends(materialTypeId: string, daysBack?: number): Promise<PriceTrend[]>
  /** @deprecated References removed `cost_per_sqft` columns. */
  getBestPrice(materialTypeId: string): Promise<BestPriceOption | null>
  /** @deprecated References removed `cost_per_sqft` columns. */
  bulkTrackPriceChanges(changes: PriceBulkChange[]): Promise<PriceHistory[]>
  /** @deprecated References removed `cost_per_sqft` columns. */
  calculateValueScore(supplier: MaterialSupplierWithDetails): number
}
