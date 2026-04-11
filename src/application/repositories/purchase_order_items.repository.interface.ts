import type {
  PurchaseOrderItem,
  PurchaseOrderItemWithDetails,
  CreatePurchaseOrderItem,
  UpdatePurchaseOrderItem,
} from "@/src/infrastructure/models/supabase"

export interface IPurchaseOrderItemsRepository {
  findById(id: string): Promise<PurchaseOrderItem | null>
  findByPurchaseOrderId(purchaseOrderId: string): Promise<PurchaseOrderItemWithDetails[]>
  create(data: CreatePurchaseOrderItem): Promise<PurchaseOrderItem>
  update(id: string, data: UpdatePurchaseOrderItem): Promise<PurchaseOrderItem>
  delete(id: string): Promise<void>
}
