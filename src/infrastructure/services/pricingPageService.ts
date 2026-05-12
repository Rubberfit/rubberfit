import { subDays } from "date-fns"

import type {
  MaterialType,
  MaterialSupplierWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { materialSuppliersRepository } from "@/src/infrastructure/repositories/material-suppliers.repository"
import { legacySupplierService as supplierService } from "@/src/infrastructure/services/legacySupplierService"
import {
  priceHistoryService,
  type PriceHistoryWithJoins,
} from "@/src/infrastructure/services/priceHistoryService"

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

export interface PricingFetchResult {
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  materialSuppliers: MaterialSupplierWithDetails[]
  priceHistory: PriceHistoryWithJoins[]
  priceAlerts: PriceAlert[]
}

export function generatePriceAlerts(history: PriceHistoryWithJoins[]): PriceAlert[] {
  return history
    .filter((h) => h.price_change_percentage != null && Math.abs(h.price_change_percentage) > 5)
    .slice(0, 10)
    .map((h) => ({
      id: h.id,
      materialName: h.material_supplier?.material_type?.name || "Unknown",
      supplierName: h.material_supplier?.supplier?.name || "Unknown",
      oldPrice: h.old_cost_per_sqft || 0,
      newPrice: h.new_cost_per_sqft,
      changePercentage: h.price_change_percentage!,
      changeDate: h.created_at,
      type: (h.price_change_percentage ?? 0) > 0 ? ("increase" as const) : ("decrease" as const),
    }))
}

export async function fetchPricingPageData(dateRange: string): Promise<PricingFetchResult> {
  const startDate = subDays(new Date(), parseInt(dateRange))

  const [materialTypes, suppliers, materialSuppliers, priceHistory] = await Promise.all([
    materialTypeRepository.getAll(),
    supplierService.getActiveSuppliers(),
    materialSuppliersRepository.getActiveWithDetails(),
    priceHistoryService.getPriceHistoryByDateRange(startDate) as Promise<PriceHistoryWithJoins[]>,
  ])

  return {
    materialTypes,
    suppliers,
    materialSuppliers,
    priceHistory,
    priceAlerts: generatePriceAlerts(priceHistory),
  }
}
