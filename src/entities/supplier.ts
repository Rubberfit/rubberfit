import type { Money, Percentage } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type CreateSupplier = Omit<
  Supplier,
  "id" | keyof AuditFields | keyof SoftDeletable
>
export type UpdateSupplier = Partial<CreateSupplier>

export interface Supplier extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  name: string
  addressId: string | null
  email: string | null
  generalPhone: string | null
  website: string | null
  taxId: string | null
  taxRate: Percentage | null
  taxExempt: boolean
  currency: string
  paymentTerms: string | null
  shippingCost: Money | null
  rating: number | null
  preferred: boolean
  active: boolean
  notes: string | null
}
