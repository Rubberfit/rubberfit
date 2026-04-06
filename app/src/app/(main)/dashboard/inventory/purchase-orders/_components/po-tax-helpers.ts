import { type PurchaseOrderWithDetails } from "@/lib/supabase"
import { taxService } from "@/services/taxService"

export interface TaxDetails {
  taxRate: number
  taxName: string
  taxLevel: string
}

export async function fetchTaxDetails(po: PurchaseOrderWithDetails): Promise<TaxDetails> {
  // Check if supplier_id exists
  if (!po.supplier_id) {
    console.warn("PO has no supplier_id, using stored tax amount", { poId: po.id })
    return {
      taxRate: po.tax_amount ? po.tax_amount / po.subtotal : 0.08,
      taxName: "Stored Tax",
      taxLevel: "stored",
    }
  }

  try {
    const taxCalc = await taxService.calculatePurchaseOrderTax(po.supplier_id, po.subtotal)
    return {
      taxRate: taxCalc.taxRate,
      taxName: taxCalc.taxName,
      taxLevel: taxCalc.taxLevel,
    }
  } catch (error) {
    console.error("Error fetching tax details:", error)
    // Use stored tax or defaults if error
    return {
      taxRate: po.tax_amount ? po.tax_amount / po.subtotal : 0.08,
      taxName: "Fallback Tax",
      taxLevel: "fallback",
    }
  }
}

export async function fetchCreateFormTaxDetails(
  supplierId: string,
  items: Array<{ quantity_sqft: number; unit_cost: number }>
): Promise<TaxDetails | null> {
  if (!supplierId) {
    return null
  }

  try {
    const subtotal = items.reduce((sum, item) => sum + item.quantity_sqft * item.unit_cost, 0)
    const taxCalc = await taxService.calculatePurchaseOrderTax(supplierId, subtotal)
    return {
      taxRate: taxCalc.taxRate,
      taxName: taxCalc.taxName,
      taxLevel: taxCalc.taxLevel,
    }
  } catch (error) {
    console.error("Error fetching create form tax details:", {
      error: error instanceof Error ? error.message : error,
      supplierId,
    })
    // Use default tax on error
    return {
      taxRate: 0.08,
      taxName: "Default Tax (8%)",
      taxLevel: "default",
    }
  }
}

export async function fetchEditFormTaxDetails(
  supplierId: string,
  items: Array<{ quantity_sqft: number; unit_cost: number }>
): Promise<TaxDetails | null> {
  if (!supplierId || supplierId.trim() === "") {
    return null
  }

  try {
    const subtotal = items.reduce((sum, item) => sum + item.quantity_sqft * item.unit_cost, 0)
    const taxCalc = await taxService.calculatePurchaseOrderTax(supplierId, subtotal)
    return {
      taxRate: taxCalc.taxRate,
      taxName: taxCalc.taxName,
      taxLevel: taxCalc.taxLevel,
    }
  } catch (error) {
    console.error("Error fetching edit form tax details:", {
      error: error instanceof Error ? error.message : error,
      supplierId,
    })
    // Use default tax on error
    return {
      taxRate: 0.08,
      taxName: "Default Tax (8%)",
      taxLevel: "default",
    }
  }
}
