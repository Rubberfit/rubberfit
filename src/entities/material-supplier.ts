import type { Area, PricePerArea } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"
import type { MaterialType } from "./material-type"
import type { Supplier } from "./supplier"

export type CreateMaterialSupplier = Omit<
  MaterialSupplier,
  "id" | keyof AuditFields | keyof SoftDeletable
>
export type UpdateMaterialSupplier = Partial<CreateMaterialSupplier>

export interface MaterialSupplierWithDetails extends MaterialSupplier {
  materialType: MaterialType
  supplier: Supplier
}

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
