import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

export interface POAnalyticsStats {
  total: number
  byStatus: Record<string, number>
  totalValue: number
  avgOrderValue: number
}

export interface IPurchaseOrderAnalyticsService {
  getPurchaseOrderStats(): Promise<POAnalyticsStats>
  getSupplierPurchaseHistory(
    supplierId: string,
    limit?: number
  ): Promise<PurchaseOrderWithDetails[]>
  getPendingDeliveries(): Promise<PurchaseOrderWithDetails[]>
}
