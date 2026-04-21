import type { Area } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface ReorderRule extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  materialTypeId: string
  supplierId: string | null
  reorderPoint: Area
  reorderQuantity: Area
  maxStockLevel: Area | null
  leadTimeDays: number
  safetyStockDays: number
  autoReorder: boolean
  active: boolean
  notes: string | null
  lastTriggeredAt: string | null
}
