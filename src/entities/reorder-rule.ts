import type { Area } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"
import type { MaterialType } from "./material-type"
import type { Supplier } from "./supplier"

export type CreateReorderRule = Omit<
  ReorderRule,
  "id" | keyof AuditFields | keyof SoftDeletable
>
export type UpdateReorderRule = Partial<CreateReorderRule>

export interface ReorderRuleWithDetails extends ReorderRule {
  materialType: MaterialType
  supplier: Supplier | null
}

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
