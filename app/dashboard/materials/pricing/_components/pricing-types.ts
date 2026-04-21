import type {
  MaterialType,
  MaterialSupplierWithDetails,
  PriceHistory,
  Supplier,
} from "@/src/infrastructure/models/database.types"

export interface PriceHistoryWithJoins extends PriceHistory {
  material_supplier?: MaterialSupplierWithDetails & {
    material_type?: MaterialType
    supplier?: Supplier
  }
}

export interface PriceComparisonData {
  materialTypeId: string
  materialName: string
  suppliers: {
    supplierId: string
    supplierName: string
    currentPrice: number
    leadTime: number
    minOrder: number
    isPreferred: boolean
    lastChange?: {
      date: string
      percentage: number
    }
    priceHistory: Array<{
      date: string
      price: number
    }>
  }[]
  bestPrice: number
  avgPrice: number
  priceRange: {
    min: number
    max: number
  }
}

export interface PriceAlert {
  id: string
  materialName: string
  supplierName: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  changeDate: string
  type: "increase" | "decrease"
}
