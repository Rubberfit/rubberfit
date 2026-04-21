import type { Area } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface MaterialType extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  name: string
  description: string | null
  minStock: Area | null
}
