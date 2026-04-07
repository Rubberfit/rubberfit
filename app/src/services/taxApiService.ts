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

const memoryCache = new Map<string, { data: TaxApiResult; timestamp: number }>()
const MEMORY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export const taxApiService = {
  async getTaxRateByZip(postalCode: string): Promise<TaxApiResult | null> {
    const zip5 = postalCode.trim().substring(0, 5)

    if (!/^\d{5}$/.test(zip5)) {
      console.warn("Invalid ZIP code for tax lookup:", postalCode)
      return null
    }

    // Check in-memory cache
    const cached = memoryCache.get(zip5)
    if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
      return cached.data
    }

    try {
      const response = await fetch(`/api/tax-rates?postalCode=${zip5}`)

      if (!response.ok) {
        console.warn("Tax rate API returned error:", response.status)
        return null
      }

      const data: TaxApiResult = await response.json()

      memoryCache.set(zip5, { data, timestamp: Date.now() })

      return data
    } catch (error) {
      console.error("Failed to fetch tax rate:", error)
      return null
    }
  },

  clearCache() {
    memoryCache.clear()
  },
}
