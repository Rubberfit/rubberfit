import type { Area } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface ProjectMaterial extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  projectId: string
  materialTypeId: string
  requiredQuantity: Area | null
  allocatedQuantity: Area
  notes: string | null
}
