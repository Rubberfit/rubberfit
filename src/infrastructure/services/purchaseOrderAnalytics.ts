import { supabase, type PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"
import "reflect-metadata"
import { injectable } from "tsyringe"
import type {
  IPurchaseOrderAnalyticsService,
  POAnalyticsStats,
} from "@/src/application/services/purchase-order-analytics.service.interface"

@injectable()
export class PurchaseOrderAnalyticsService implements IPurchaseOrderAnalyticsService {
  async getPurchaseOrderStats(): Promise<POAnalyticsStats> {
    try {
      const { data, error } = await supabase.from("purchase_orders").select("status, total_amount")

      if (error) throw error

      const stats: POAnalyticsStats = {
        total: data?.length || 0,
        byStatus: {},
        totalValue: 0,
        avgOrderValue: 0,
      }

      if (data && data.length > 0) {
        data.forEach((po: { status: string; total_amount?: number | null }) => {
          stats.byStatus[po.status] = (stats.byStatus[po.status] || 0) + 1
          stats.totalValue += po.total_amount || 0
        })

        stats.avgOrderValue = stats.totalValue / data.length
      }

      return stats
    } catch (error) {
      console.error("Error getting purchase order stats:", error)
      throw error
    }
  }

  async getSupplierPurchaseHistory(
    supplierId: string,
    limit: number = 10
  ): Promise<PurchaseOrderWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          items:purchase_order_items(count)
        `
        )
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false })
        .limit(limit)

      if (error) throw error
      return data as PurchaseOrderWithDetails[]
    } catch (error) {
      console.error("Error getting supplier purchase history:", error)
      throw error
    }
  }

  async getPendingDeliveries(): Promise<PurchaseOrderWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          supplier:suppliers(id, name),
          items:purchase_order_items(*)
        `
        )
        .in("status", ["ordered", "approved"])
        .order("requested_delivery_date", { ascending: true })

      if (error) throw error
      return data as PurchaseOrderWithDetails[]
    } catch (error) {
      console.error("Error getting pending deliveries:", error)
      throw error
    }
  }
}

export const purchaseOrderAnalytics = new PurchaseOrderAnalyticsService()
