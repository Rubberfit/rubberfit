import type {
  MaterialType,
  MaterialSupplierWithDetails,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import { subDays } from "date-fns"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"
import { materialSuppliersRepository } from "@/src/infrastructure/repositories/material-suppliers.repository"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import { priceHistoryService } from "@/src/infrastructure/services/priceHistoryService"
import type { PriceHistoryWithJoins, PriceAlert } from "./pricing-types"

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

export async function fetchPricingData(dateRange: string): Promise<PricingFetchResult> {
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
