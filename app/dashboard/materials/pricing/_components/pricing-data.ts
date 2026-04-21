import { supabase } from "@/src/infrastructure/models/supabase-context"
import type {
  MaterialType,
  MaterialSupplierWithDetails,
  Supplier,
} from "@/src/infrastructure/models/database.types"
import { subDays } from "date-fns"
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
  // Fetch material types
  const { data: materialsData, error: materialsError } = await supabase
    .from("material_types")
    .select("*")
    .order("name")

  if (materialsError) throw materialsError

  // Fetch suppliers
  const { data: suppliersData, error: suppliersError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("active", true)
    .order("name")

  if (suppliersError) throw suppliersError

  // Fetch material supplier relationships
  const { data: materialSuppliersData, error: materialSuppliersError } = await supabase
    .from("material_suppliers")
    .select(
      `
      *,
      material_type:material_types(*),
      supplier:suppliers(*)
    `
    )
    .eq("active", true)

  if (materialSuppliersError) throw materialSuppliersError

  // Fetch price history
  const startDate = subDays(new Date(), parseInt(dateRange))
  const { data: priceHistoryData, error: priceHistoryError } = await supabase
    .from("price_history")
    .select(
      `
      *,
      material_supplier:material_suppliers(
        *,
        material_type:material_types(*),
        supplier:suppliers(*)
      )
    `
    )
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: false })

  if (priceHistoryError) throw priceHistoryError

  const history = priceHistoryData || []

  return {
    materialTypes: materialsData || [],
    suppliers: suppliersData || [],
    materialSuppliers: materialSuppliersData || [],
    priceHistory: history,
    priceAlerts: generatePriceAlerts(history),
  }
}
