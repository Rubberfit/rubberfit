export interface TaxRateBreakdown {
  rate: number
  name: string
  type: string
}

export interface TaxApiResult {
  totalRate: number
  rates: TaxRateBreakdown[]
  postalCode: string
  city?: string
  state?: string
  county?: string
}

export interface ITaxApiService {
  getTaxRateByZip(postalCode: string): Promise<TaxApiResult | null>
  clearCache(): void
}
