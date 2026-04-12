import { supabase } from "@/src/infrastructure/models/supabase"
import { taxApiService } from "./taxApiService"
import type { ITaxService, TaxCalculation, TaxRateDetails } from "@/src/application/services/tax.service.interface"
import type { ITaxApiService } from "@/src/application/services/tax-api.service.interface"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@/di/tokens"

export type { TaxRateDetails, TaxCalculation }

const API_CACHE_DAYS = 30

@injectable()
export class TaxService implements ITaxService {
  constructor(
    @inject(TOKENS.ITaxApiService) private readonly taxApi: ITaxApiService
  ) {}
  private readonly DEFAULT_TAX: TaxRateDetails = {
    tax_rate: 0.08,
    tax_name: "Default Tax Rate (8%)",
    tax_level: "default",
  }

  private async resolveTaxFromCache(
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

  private async resolveTaxFromApi(
    zipCode: string,
    stateCode: string | null,
    city: string | null
  ): Promise<TaxRateDetails | null> {
    const apiResult = await this.taxApi.getTaxRateByZip(zipCode)

    if (!apiResult || apiResult.totalRate <= 0) return null

    const taxName = this.buildTaxNameFromApi(apiResult.rates)
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

  private async resolveTaxFromDbFallback(
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

  async getTaxRateForLocation(
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<TaxRateDetails> {
    try {
      if (!state && !zipCode) {
        return this.DEFAULT_TAX
      }

      const stateCode = state?.toUpperCase() || null

      // Step 1: Check cached rates in database
      const cached = await this.resolveTaxFromCache(stateCode, city ?? null, zipCode ?? null)
      if (cached) return cached

      // Step 2: Try Ziptax API if we have a ZIP code
      if (zipCode) {
        const apiResult = await this.resolveTaxFromApi(zipCode, stateCode, city ?? null)
        if (apiResult) return apiResult
      }

      // Step 3: Fall back to whatever the DB had
      const dbFallback = await this.resolveTaxFromDbFallback(stateCode, city ?? null, zipCode ?? null)
      if (dbFallback) return dbFallback

      // Step 4: Ultimate fallback
      return this.DEFAULT_TAX
    } catch (error) {
      console.error("Error in getTaxRateForLocation:", error)
      return this.DEFAULT_TAX
    }
  }

  buildTaxNameFromApi(rates: Array<{ rate: number; name: string; type: string }>): string {
    const parts = rates
      .filter((r) => r.rate > 0)
      .map((r) => `${r.name} ${(r.rate * 100).toFixed(2)}%`)

    if (parts.length === 0) return "Combined Tax"
    if (parts.length <= 2) return parts.join(" + ")
    return `Combined Tax (${parts.length} jurisdictions)`
  }

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
  }

  async getTaxRatesForState(state: string): Promise<TaxRateDetails[]> {
    try {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("*")
        .eq("state", state.toUpperCase())
        .eq("is_active", true)
        .order("city", { ascending: true })

      if (error) throw error
      return (data || []) as TaxRateDetails[]
    } catch (error) {
      console.error("Error fetching tax rates for state:", error)
      throw error
    }
  }

  formatTaxRate(rate: number): string {
    return `${(rate * 100).toFixed(2)}%`
  }

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
  }

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
  }

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
  }

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
  }

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
  }
}

export const taxService = new TaxService(taxApiService)
