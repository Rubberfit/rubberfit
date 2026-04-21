import type {
  MaterialSupplierWithDetails,
  PriceHistory,
} from "@/src/infrastructure/models/database.types"

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

export interface IPriceHistoryService {
  trackPriceChange(
    materialSupplierId: string,
    oldPrice: number | undefined,
    newPrice: number,
    changeReason?: string,
    changedBy?: string
  ): Promise<PriceHistory>
  getPriceHistory(materialSupplierId: string, limit?: number): Promise<PriceHistory[]>
  getMaterialPriceHistory(
    materialTypeId: string,
    daysBack?: number
  ): Promise<PriceHistoryWithJoins[]>
  comparePrices(materialTypeId: string): Promise<PriceComparison>
  calculatePriceTrends(materialTypeId: string, daysBack?: number): Promise<PriceTrend[]>
  getBestPrice(materialTypeId: string): Promise<BestPriceOption | null>
  getSignificantPriceChanges(
    thresholdPercentage?: number,
    daysBack?: number
  ): Promise<PriceHistoryWithJoins[]>
  bulkTrackPriceChanges(changes: PriceBulkChange[]): Promise<PriceHistory[]>
  calculateValueScore(supplier: MaterialSupplierWithDetails): number
}
