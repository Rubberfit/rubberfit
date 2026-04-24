import { type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import { tax as taxSdk } from "@/src/infrastructure/api-client/rf/procurement"

export interface TaxDetails {
  taxRate: number
  taxName: string
  taxLevel: string
}

/**
 * Preview tax via the SDK. Flag-OFF delegates to legacy
 * `taxService.calculatePurchaseOrderTax` and hydrates to the
 * snake_case DTO shape. Flag-ON hits `/api/v2/po/tax/preview` which
 * proxies the TS tax service from Rust. Either way this function
 * returns the same camelCase `TaxDetails` the PO UI already
 * consumes.
 */
async function preview(
  supplierId: string,
  subtotal: number
): Promise<TaxDetails> {
  const calc = await taxSdk.preview(supplierId, subtotal)
  return {
    taxRate: calc.tax_rate,
    taxName: calc.tax_name,
    taxLevel: calc.tax_level,
  }
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
    return await preview(po.supplier_id, po.subtotal)
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
    return await preview(supplierId, subtotal)
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
    return await preview(supplierId, subtotal)
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
