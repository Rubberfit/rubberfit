import type { Percentage } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type TaxRateSource = "manual" | "avalara" | "default"

export interface TaxRate extends AuditFields, SoftDeletable {
  id: string
  state: string
  city: string | null
  zipCode: string | null
  taxRate: Percentage
  taxName: string
  effectiveDate: string
  isActive: boolean
  source: TaxRateSource
}
