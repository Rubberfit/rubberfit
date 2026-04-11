import type { MaterialType, ReorderRuleWithDetails } from "@/app/lib/supabase"
import { supplierService } from "@/src/infrastructure/services/supplierService"

export interface ReorderSuggestion {
  materialTypeId: string
  materialName: string
  currentStock: number
  reorderPoint: number
  suggestedQuantity: number
  urgencyLevel: "critical" | "high" | "medium" | "low"
  daysUntilStockout: number
  supplierId?: string
  supplierName?: string
  estimatedCost: number
  pendingQuantity?: number
}

export async function generateReorderSuggestions(
  rules: ReorderRuleWithDetails[],
  _materials: MaterialType[],
  pendingPOs: Array<{ items?: Array<{ material_type_id: string; quantity_sqft: number }> }> = []
): Promise<ReorderSuggestion[]> {
  const newSuggestions: ReorderSuggestion[] = []

  // Calculate pending quantities per material type
  const pendingQuantities: Record<string, number> = {}
  pendingPOs.forEach((po) => {
    if (po.items) {
      po.items.forEach((item) => {
        if (item.material_type_id) {
          pendingQuantities[item.material_type_id] =
            (pendingQuantities[item.material_type_id] || 0) + item.quantity_sqft
        }
      })
    }
  })

  for (const rule of rules) {
    if (rule.current_stock == null || !rule.material_type) continue

    const currentStock = rule.current_stock
    const pendingQty = pendingQuantities[rule.material_type_id] || 0
    const effectiveStock = currentStock + pendingQty // Consider pending orders
    const reorderPoint = rule.reorder_point

    // Only suggest reorder if effective stock (including pending orders) is still below reorder point
    if (effectiveStock <= reorderPoint) {
      // Calculate urgency based on current physical stock
      const dailyUsage = 10 // Mock daily usage
      const daysUntilStockout = Math.max(0, Math.floor(currentStock / dailyUsage))

      let urgencyLevel: "critical" | "high" | "medium" | "low"
      if (daysUntilStockout <= 2) urgencyLevel = "critical"
      else if (daysUntilStockout <= 5) urgencyLevel = "high"
      else if (daysUntilStockout <= 10) urgencyLevel = "medium"
      else urgencyLevel = "low"

      // Calculate EOQ (simplified)
      const annualDemand = dailyUsage * 365
      const orderingCost = 50 // Mock ordering cost
      const holdingCost = (rule.material_type.default_cost || 5) * 0.2 // 20% of item cost
      const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost)

      // Adjust suggested quantity based on pending orders
      const baseQuantity = Math.max(rule.reorder_quantity, Math.round(eoq))
      const suggestedQuantity = Math.max(0, baseQuantity - pendingQty)

      // Resolve supplier: rule's supplier_id first, then fall back to preferred supplier from material_suppliers
      let supplierId = rule.supplier_id
      let supplierName = rule.supplier?.name

      if (!supplierId) {
        try {
          const preferred = await supplierService.getPreferredSupplierForMaterial(
            rule.material_type_id
          )
          if (preferred) {
            supplierId = preferred.supplier_id
            supplierName = preferred.supplier?.name
          }
        } catch (_error) {
          // Ignore — supplier just won't be set
        }
      }

      if (suggestedQuantity > 0) {
        newSuggestions.push({
          materialTypeId: rule.material_type_id,
          materialName: rule.material_type.name,
          currentStock,
          reorderPoint,
          suggestedQuantity,
          urgencyLevel,
          daysUntilStockout,
          supplierId,
          supplierName,
          estimatedCost: suggestedQuantity * (rule.material_type.default_cost || 5),
          pendingQuantity: pendingQty,
        })
      }
    }
  }

  return newSuggestions.sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
}

export function getStockStatus(current: number, reorderPoint: number, max: number) {
  const percentage = (current / max) * 100
  if (current <= reorderPoint) return { status: "low", color: "bg-red-500" }
  if (percentage < 50) return { status: "medium", color: "bg-yellow-500" }
  return { status: "ok", color: "bg-green-500" }
}
