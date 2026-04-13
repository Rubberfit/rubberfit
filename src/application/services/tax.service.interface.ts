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

export interface ITaxService {
  getTaxRateForLocation(
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<TaxRateDetails>
  buildTaxNameFromApi(rates: Array<{ rate: number; name: string; type: string }>): string
  calculateTax(
    subtotal: number,
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<TaxCalculation>
  getTaxRatesForState(state: string): Promise<TaxRateDetails[]>
  formatTaxRate(rate: number): string
  getTaxRateDisplay(rate: number, name?: string, level?: string): string
  isSupplierTaxExempt(supplierId: string): Promise<boolean>
  getSupplierLocation(
    supplierId: string
  ): Promise<{
    state?: string | null
    city?: string | null
    zip_code?: string | null
    tax_exempt?: boolean | null
    tax_rate?: number | null
  } | null>
  calculatePurchaseOrderTax(supplierId: string, subtotal: number): Promise<TaxCalculation>
  batchCalculateTax(
    items: Array<{ id: string; amount: number }>,
    state?: string | null,
    city?: string | null,
    zipCode?: string | null
  ): Promise<
    Array<{
      id: string
      amount: number
      taxRate: number
      taxAmount: number
      total: number
      taxName: string
      taxLevel: string
    }>
  >
}
