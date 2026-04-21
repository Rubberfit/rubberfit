import type { Length, PricePerArea } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type RollStatus = "active" | "depleted" | "reserved"
export type RollSourceType = "received" | "offcut"

export interface Roll extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string | null
  sourceType: RollSourceType
  parentRollId: string | null
  sourceCutHistoryId: string | null
  width: Length
  length: Length
  remainingLength: Length
  thickness: Length
  color: string | null
  location: string | null
  dateReceived: string
  costPerArea: PricePerArea | null
  status: RollStatus
  notes: string | null
  qrGeneratedAt: string | null
}
