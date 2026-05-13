import type {
  CreatePurchaseOrder,
  CreatePurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderItemWithDetails,
  PurchaseOrderWithDetails,
  Roll,
  UpdatePurchaseOrder,
  UpdatePurchaseOrderItem,
} from "@/src/infrastructure/models/supabase"

export interface POReceiptItem {
  itemId: string
  quantityReceived: number
  rollData?: Partial<Roll>
}

export interface POReceiptResult {
  purchaseOrderId: string
  itemsReceived: number
  rollsCreated: Roll[]
  partialReceipt: boolean
  completedAt?: string
}

/**
 * Pre-DDD purchase-order surface. Wide bag of raw-row CRUD + status
 * transitions + helpers, retained as a shim so the existing PO UI,
 * RF api-client, server actions, and PO use-cases keep working until
 * their consumer rewrites land. New code: resolve `IPurchaseOrderService`
 * (entity-typed) for status transitions + receipt recording, and
 * `IPurchaseOrdersRepository` for direct read access to the aggregate.
 *
 * Retires per consumer migration. Once the 5 PO use-cases are flipped
 * to the entity-typed service and the 3 UI surfaces have been migrated,
 * this interface can shrink to just raw-row reads (for the RF api-client)
 * and the dead-code dropper can run on the rest.
 *
 * @deprecated New code: use `IPurchaseOrderService` and
 * `IPurchaseOrdersRepository`.
 */
export interface ILegacyPurchaseOrderService {
  getAllPurchaseOrders(): Promise<PurchaseOrderWithDetails[]>
  getPurchaseOrdersByStatus(status: PurchaseOrder["status"]): Promise<PurchaseOrderWithDetails[]>
  getPurchaseOrdersByStatuses(
    statuses: PurchaseOrder["status"][]
  ): Promise<PurchaseOrderWithDetails[]>
  getPurchaseOrderById(id: string): Promise<PurchaseOrderWithDetails>
  createPurchaseOrder(
    order: CreatePurchaseOrder,
    userId?: string
  ): Promise<PurchaseOrderWithDetails>
  updatePurchaseOrder(id: string, updates: UpdatePurchaseOrder): Promise<PurchaseOrderWithDetails>
  deletePurchaseOrder(id: string): Promise<boolean>
  addItemToPurchaseOrder(
    item: CreatePurchaseOrderItem,
    userId?: string
  ): Promise<PurchaseOrderItemWithDetails>
  updatePurchaseOrderItem(
    id: string,
    updates: UpdatePurchaseOrderItem
  ): Promise<PurchaseOrderItemWithDetails>
  deletePurchaseOrderItem(id: string): Promise<boolean>
  submitForApproval(id: string, submittedBy?: string): Promise<PurchaseOrder>
  approvePurchaseOrder(id: string, approvedBy?: string): Promise<PurchaseOrder>
  rejectPurchaseOrder(id: string, rejectedBy?: string, reason?: string): Promise<PurchaseOrder>
  markAsOrdered(id: string): Promise<PurchaseOrder>
  cancelPurchaseOrder(id: string, cancelledBy?: string, reason?: string): Promise<PurchaseOrder>
  receivePurchaseOrder(
    id: string,
    items: POReceiptItem[],
    receivedBy?: string
  ): Promise<POReceiptResult>
  generatePONumber(): Promise<string>
  isValidStatusTransition(from: PurchaseOrder["status"], to: PurchaseOrder["status"]): boolean
  updatePurchaseOrderStatus(
    id: string,
    status: PurchaseOrder["status"],
    changedBy?: string,
    reason?: string
  ): Promise<PurchaseOrder>
  recalculatePOTotals(purchaseOrderId: string): Promise<void>
  existsItemsByMaterialType(materialTypeId: string): Promise<boolean>
  getPurchaseOrderTaxDetails(supplierId: string, subtotal: number): Promise<unknown>
}
