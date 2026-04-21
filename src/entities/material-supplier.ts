import type { Area, PricePerArea } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface MaterialSupplier extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string
  supplierMaterialCode: string | null
  costPerArea: PricePerArea
  minimumOrder: Area
  leadTimeDays: number
  preferredSupplier: boolean
  active: boolean
  notes: string | null
  effectiveDate: string
  expirationDate: string | null
}
