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

export interface IPurchaseOrderService {
  getAllPurchaseOrders(): Promise<PurchaseOrderWithDetails[]>
  getPurchaseOrdersByStatus(status: PurchaseOrder["status"]): Promise<PurchaseOrderWithDetails[]>
  getPurchaseOrderById(id: string): Promise<PurchaseOrderWithDetails>
  createPurchaseOrder(order: CreatePurchaseOrder): Promise<PurchaseOrderWithDetails>
  updatePurchaseOrder(id: string, updates: UpdatePurchaseOrder): Promise<PurchaseOrderWithDetails>
  deletePurchaseOrder(id: string): Promise<boolean>
  addItemToPurchaseOrder(item: CreatePurchaseOrderItem): Promise<PurchaseOrderItemWithDetails>
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
