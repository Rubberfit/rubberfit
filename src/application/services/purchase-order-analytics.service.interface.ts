import type { PurchaseOrder, PurchaseOrderWithDetails, Roll } from "@/src/infrastructure/models/supabase"
import type { POReceiptItem } from "@/src/application/services/purchase-order.service.interface"

export interface POAnalyticsStats {
  total: number
  byStatus: Record<string, number>
  totalValue: number
  avgOrderValue: number
}

export interface IPurchaseOrderAnalyticsService {
  receivePurchaseOrder(
    id: string,
    items: POReceiptItem[],
    receivedBy: string | undefined,
    updateStatus: (
      id: string,
      status: PurchaseOrder["status"],
      changedBy?: string,
      reason?: string
    ) => Promise<unknown>
  ): Promise<{
    purchaseOrderId: string
    itemsReceived: number
    rollsCreated: Roll[]
    partialReceipt: boolean
    completedAt?: string
  }>
  getPurchaseOrderStats(): Promise<POAnalyticsStats>
  getSupplierPurchaseHistory(supplierId: string, limit?: number): Promise<PurchaseOrderWithDetails[]>
  getPendingDeliveries(): Promise<PurchaseOrderWithDetails[]>
}
