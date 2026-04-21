import type { Money } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type ProjectStatus = "draft" | "active" | "completed" | "cancelled"

export interface Project extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  name: string
  description: string | null
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  personId: string | null
  budget: Money | null
  notes: string | null
}
