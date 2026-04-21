import type { Area, Length, Percentage } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface Cut extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  rollId: string | null
  cutWidth: Length
  cutLength: Length
  quantity: number
  waste: Area | null
  wastePercentage: Percentage | null
  totalUsed: Area | null
  jobReference: string | null
  cutBy: string | null
  notes: string | null
}
