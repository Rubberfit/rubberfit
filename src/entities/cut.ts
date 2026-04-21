import type { Area, Length, Percentage } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type CreateCut = Omit<Cut, "id" | keyof AuditFields | keyof SoftDeletable>
export type UpdateCut = Partial<CreateCut>

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
