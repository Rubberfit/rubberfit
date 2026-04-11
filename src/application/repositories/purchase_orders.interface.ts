import type {
  PurchaseOrder,
  PurchaseOrderWithDetails,
  CreatePurchaseOrder,
  UpdatePurchaseOrder,
} from "@/src/infrastructure/models/supabase"

export interface IPurchaseOrdersRepository {
  findById(id: string): Promise<PurchaseOrder | null>
  findAll(userId: string): Promise<PurchaseOrder[]>
  findByStatus(userId: string, status: PurchaseOrder["status"]): Promise<PurchaseOrderWithDetails[]>
  findBySupplierId(userId: string, supplierId: string): Promise<PurchaseOrder[]>
  create(data: CreatePurchaseOrder): Promise<PurchaseOrder>
  update(id: string, data: UpdatePurchaseOrder): Promise<PurchaseOrder>
  delete(id: string): Promise<void>
}
