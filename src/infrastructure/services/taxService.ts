import { supabase } from "@/lib/supabase"
import { taxApiService } from "./taxApiService"

const API_CACHE_DAYS = 30

export interface TaxRateDetails {
  tax_rate: number
  tax_name: string
  tax_level: "zip_code" | "city" | "state" | "default" | "api"
}

export interface TaxCalculation {
  subtotal: number
  taxRate: number
  taxAmount: number
  taxName: string
  taxLevel: string
  total: number
}

const DEFAULT_TAX: TaxRateDetails = {
  tax_rate: 0.08,
  tax_name: "Default Tax Rate (8%)",
  tax_level: "default",
}

async function resolveTaxFromCache(
  stateCode: string | null,
  city: string | null,
  zipCode: string | null
): Promise<TaxRateDetails | null> {
  const { data, error } = await supabase.rpc("get_tax_rate_details", {
    p_state: stateCode || "XX",
    p_city: city || null,
    p_zip_code: zipCode || null,
  })

  if (error || !data || data.length === 0) return null

  const cached = data[0]
  const isExpired = cached.expires_at && new Date(cached.expires_at) < new Date()

  if (!isExpired && cached.tax_level !== "default") {
    return {
      tax_rate: cached.tax_rate,
      tax_name: cached.tax_name,
      tax_level: cached.source === "avalara" ? "api" : cached.tax_level,
    } as TaxRateDetails
  }

  return null
}

async function resolveTaxFromApi(
  zipCode: string,
  stateCode: string | null,
  city: string | null,
  buildTaxName: (rates: Array<{ rate: number; name: string; type: string }>) => string
): Promise<TaxRateDetails | null> {
  const apiResult = await taxApiService.getTaxRateByZip(zipCode)

  if (!apiResult || apiResult.totalRate <= 0) return null

  const taxName = buildTaxName(apiResult.rates)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + API_CACHE_DAYS)

  // Cache the result (fire-and-forget)
  supabase
    .rpc("upsert_cached_tax_rate", {
      p_state: apiResult.state || stateCode || "",
      p_city: apiResult.city || city || null,
      p_zip_code: zipCode,
      p_tax_rate: apiResult.totalRate,
      p_tax_name: taxName,
      p_expires_at: expiresAt.toISOString(),
    })
    .then(({ error: cacheError }) => {
      if (cacheError) {
        console.warn("Failed to cache API rate:", cacheError.message)
      }
    })

  return {
    tax_rate: apiResult.totalRate,
    tax_name: taxName,
    tax_level: "api",
  }
}

async function resolveTaxFromDbFallback(
  stateCode: string | null,
  city: string | null,
  zipCode: string | null
): Promise<TaxRateDetails | null> {
  const { data, error } = await supabase.rpc("get_tax_rate_details", {
    p_state: stateCode || "XX",
    p_city: city || null,
    p_zip_code: zipCode || null,
  })

  if (error || !data || data.length === 0) return null

  return {
    tax_rate: data[0].tax_rate,
    tax_name: data[0].tax_name,
    tax_level: data[0].tax_level,
  } as TaxRateDetails
}

export const taxService = {
  /**
   * Get tax rate details for a specific location.
   * Fallback chain: cached DB rate -> Ziptax API -> state rate -> 8% default
   */
  async getTaxRateForLocation(
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<TaxRateDetails> {
    try {
      if (!state && !zipCode) {
        return DEFAULT_TAX
      }

      const stateCode = state?.toUpperCase() || null

      // Step 1: Check cached rates in database
      const cached = await resolveTaxFromCache(stateCode, city ?? null, zipCode ?? null)
      if (cached) return cached

      // Step 2: Try Ziptax API if we have a ZIP code
      if (zipCode) {
        const apiResult = await resolveTaxFromApi(
          zipCode,
          stateCode,
          city ?? null,
          this.buildTaxNameFromApi
        )
        if (apiResult) return apiResult
      }

      // Step 3: Fall back to whatever the DB had
      const dbFallback = await resolveTaxFromDbFallback(stateCode, city ?? null, zipCode ?? null)
      if (dbFallback) return dbFallback

      // Step 4: Ultimate fallback
      return DEFAULT_TAX
    } catch (error) {
      console.error("Error in getTaxRateForLocation:", error)
      return DEFAULT_TAX
    }
  },

  /**
   * Build a human-readable tax name from API jurisdiction breakdown
   */
  buildTaxNameFromApi(rates: Array<{ rate: number; name: string; type: string }>): string {
    const parts = rates
      .filter((r) => r.rate > 0)
      .map((r) => `${r.name} ${(r.rate * 100).toFixed(2)}%`)

    if (parts.length === 0) return "Combined Tax"
    if (parts.length <= 2) return parts.join(" + ")
    return `Combined Tax (${parts.length} jurisdictions)`
  },

  /**
   * Calculate tax for a given subtotal and location
   */
  async calculateTax(
    subtotal: number,
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<TaxCalculation> {
    try {
      const taxDetails = await this.getTaxRateForLocation(state, city, zipCode)
      const taxAmount = subtotal * taxDetails.tax_rate
      const total = subtotal + taxAmount

      return {
        subtotal,
        taxRate: taxDetails.tax_rate,
        taxAmount,
        taxName: taxDetails.tax_name,
        taxLevel: taxDetails.tax_level,
        total,
      }
    } catch (error) {
      console.error("Error calculating tax:", error)
      const defaultRate = 0.08
      const taxAmount = subtotal * defaultRate
      return {
        subtotal,
        taxRate: defaultRate,
        taxAmount,
        taxName: "Default Tax Rate (8%)",
        taxLevel: "default",
        total: subtotal + taxAmount,
      }
    }
  },

  /**
   * Get all available tax rates for a specific state
   */
  async getTaxRatesForState(state: string) {
    try {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("*")
        .eq("state", state.toUpperCase())
        .eq("is_active", true)
        .order("city", { ascending: true })

      if (error) throw error
      return data || []
    } catch (error) {
      console.error("Error fetching tax rates for state:", error)
      throw error
    }
  },

  /**
   * Format tax rate as percentage string
   */
  formatTaxRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`
  },

  /**
   * Get tax rate display information
   */
  getTaxRateDisplay(rate: number, name?: string, level?: string): string {
    const percentage = this.formatTaxRate(rate)

    if (name) {
      return `${name} (${percentage})`
    }

    switch (level) {
      case "zip_code":
        return `ZIP Code Tax (${percentage})`
      case "city":
        return `City Tax (${percentage})`
      case "state":
        return `State Tax (${percentage})`
      case "api":
        return `Ziptax Rate (${percentage})`
      default:
        return `Tax (${percentage})`
    }
  },

  /**
   * Validate if a supplier is tax exempt
   */
  async isSupplierTaxExempt(supplierId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("tax_exempt")
        .eq("id", supplierId)
        .single()

      if (error) throw error
      return data?.tax_exempt || false
    } catch (error) {
      console.error("Error checking tax exemption:", error)
      return false
    }
  },

  /**
   * Get supplier location for tax calculation
   */
  async getSupplierLocation(supplierId: string) {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("state, city, zip_code, tax_exempt, tax_rate")
        .eq("id", supplierId)
        .single()

      if (error) {
        console.error("Error fetching supplier location:", error.message)
        return null
      }

      return data
    } catch (error) {
      console.error(
        "Error fetching supplier location:",
        error instanceof Error ? error.message : "Unknown error"
      )
      return null
    }
  },

  /**
   * Calculate tax for a purchase order based on supplier location
   */
  async calculatePurchaseOrderTax(supplierId: string, subtotal: number): Promise<TaxCalculation> {
    try {
      if (!supplierId || supplierId.trim() === "") {
        console.warn("calculatePurchaseOrderTax: No supplier ID provided, using default tax")
        return this.calculateTax(subtotal, null, null, null)
      }

      const supplier = await this.getSupplierLocation(supplierId)

      if (!supplier) {
        console.warn(`Supplier ${supplierId} not found, using default tax rate`)
        return this.calculateTax(subtotal, null, null, null)
      }

      if (supplier.tax_exempt) {
        return {
          subtotal,
          taxRate: 0,
          taxAmount: 0,
          taxName: "Tax Exempt",
          taxLevel: "exempt",
          total: subtotal,
        }
      }

      if (
        supplier.tax_rate !== null &&
        supplier.tax_rate !== undefined &&
        supplier.tax_rate !== 0.08
      ) {
        const taxAmount = subtotal * supplier.tax_rate
        return {
          subtotal,
          taxRate: supplier.tax_rate,
          taxAmount,
          taxName: "Supplier Override Rate",
          taxLevel: "override",
          total: subtotal + taxAmount,
        }
      }

      return this.calculateTax(subtotal, supplier.state, supplier.city, supplier.zip_code)
    } catch (error) {
      console.error("Error calculating purchase order tax:", error)
      return this.calculateTax(subtotal, null, null, null)
    }
  },

  /**
   * Batch calculate taxes for multiple line items
   */
  async batchCalculateTax(
    items: Array<{ id: string; amount: number }>,
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ) {
    try {
      const taxDetails = await this.getTaxRateForLocation(state, city, zipCode)

      return items.map((item) => ({
        id: item.id,
        amount: item.amount,
        taxRate: taxDetails.tax_rate,
        taxAmount: item.amount * taxDetails.tax_rate,
        total: item.amount * (1 + taxDetails.tax_rate),
        taxName: taxDetails.tax_name,
        taxLevel: taxDetails.tax_level,
      }))
    } catch (error) {
      console.error("Error in batch tax calculation:", error)
      throw error
    }
  },
}
