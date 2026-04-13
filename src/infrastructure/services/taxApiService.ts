import type {
  ITaxApiService,
  TaxApiResult,
  TaxRateBreakdown,
} from "@/src/application/services/tax-api.service.interface"
import "reflect-metadata"
import { injectable } from "tsyringe"

export type { TaxApiResult, TaxRateBreakdown }

@injectable()
export class TaxApiService implements ITaxApiService {
  private readonly cache = new Map<string, { data: TaxApiResult; timestamp: number }>()
  private readonly CACHE_TTL = 30 * 60 * 1000 // 30 minutes

  async getTaxRateByZip(postalCode: string): Promise<TaxApiResult | null> {
    const zip5 = postalCode.trim().substring(0, 5)

    if (!/^\d{5}$/.test(zip5)) {
      console.warn("Invalid ZIP code for tax lookup:", postalCode)
      return null
    }

    // Check in-memory cache
    const cached = this.cache.get(zip5)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data
    }

    try {
      const response = await fetch(`/api/tax-rates?postalCode=${zip5}`)

      if (!response.ok) {
        console.warn("Tax rate API returned error:", response.status)
        return null
      }

      const data: TaxApiResult = await response.json()

      this.cache.set(zip5, { data, timestamp: Date.now() })

      return data
    } catch (error) {
      console.error("Failed to fetch tax rate:", error)
      return null
    }
  }

  clearCache(): void {
    this.cache.clear()
  }
}

export const taxApiService = new TaxApiService()
