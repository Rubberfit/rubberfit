import type { Money } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type PlanCode = "standard" | "pro" | "max"
export type BillingInterval = "month" | "year"

export interface Plan extends AuditFields, SoftDeletable {
  id: string
  code: PlanCode
  name: string
  description: string | null
  price: Money
  billingInterval: BillingInterval
  stripePriceId: string | null
  seatLimit: number | null
  isActive: boolean
  isPublic: boolean
  sortOrder: number
  features: unknown
}
