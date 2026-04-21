import type { Percentage, PricePerArea } from "./value-objects"

export interface PriceHistory {
  id: string
  tenantId: string
  materialSupplierId: string
  oldCost: PricePerArea | null
  newCost: PricePerArea
  priceChange: Percentage | null
  changeReason: string | null
  effectiveDate: string
  changedBy: string | null
  notes: string | null
  createdAt: string
}
