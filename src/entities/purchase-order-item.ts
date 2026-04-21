import type { Area, Length, Money, PricePerArea } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export interface PurchaseOrderItem extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  purchaseOrderId: string
  materialTypeId: string
  lineNumber: number
  description: string | null
  width: Length | null
  length: Length | null
  thickness: Length | null
  color: string | null
  quantity: Area
  quantityReceived: Area
  unitCost: PricePerArea
  lineTotal: Money
  receivedDate: string | null
  notes: string | null
}
