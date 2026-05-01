export type { PriceHistoryWithJoins } from "@/src/infrastructure/services/priceHistoryService"

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

export type { PriceAlert } from "@/src/infrastructure/services/pricingPageService"
