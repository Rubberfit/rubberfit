import type {
  MaterialSupplierWithDetails,
  PriceHistory,
} from "@/src/infrastructure/models/supabase"

export interface PriceComparison {
  suppliers: MaterialSupplierWithDetails[]
  lowestPrice: number
  highestPrice: number
  averagePrice: number
  priceRange: number
  bestValue: MaterialSupplierWithDetails | null
}

export interface PriceTrend {
  supplierId: string
  supplierName: string
  trend: "increasing" | "decreasing" | "stable"
  changePercentage: number
  dataPoints: { date: string; price: number }[]
}

export interface BestPriceOption {
  materialSupplier: MaterialSupplierWithDetails
  costPerSqft: number
  valueScore: number
}

export interface PriceBulkChange {
  materialSupplierId: string
  oldPrice?: number
  newPrice: number
  changeReason?: string
  changedBy?: string
}

export interface PriceHistoryWithJoins extends PriceHistory {
  material_supplier?: MaterialSupplierWithDetails
}

export interface IPriceHistoryService {
  trackPriceChange(
    materialSupplierId: string,
    oldPrice: number | undefined,
    newPrice: number,
    changeReason?: string,
    changedBy?: string,
  ): Promise<PriceHistory>
  getPriceHistory(materialSupplierId: string, limit?: number): Promise<PriceHistory[]>
  getMaterialPriceHistory(
    materialTypeId: string,
    daysBack?: number,
  ): Promise<PriceHistoryWithJoins[]>
  comparePrices(materialTypeId: string): Promise<PriceComparison>
  calculatePriceTrends(materialTypeId: string, daysBack?: number): Promise<PriceTrend[]>
  getBestPrice(materialTypeId: string): Promise<BestPriceOption | null>
  getSignificantPriceChanges(
    thresholdPercentage?: number,
    daysBack?: number,
  ): Promise<PriceHistoryWithJoins[]>
  bulkTrackPriceChanges(changes: PriceBulkChange[]): Promise<PriceHistory[]>
}
