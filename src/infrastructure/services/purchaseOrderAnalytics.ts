import {
  supabase,
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
} from "@/src/infrastructure/models/supabase"
import type {
  IPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@/di/tokens"
import type {
  IPurchaseOrderAnalyticsService,
  POAnalyticsStats,
} from "@/src/application/services/purchase-order-analytics.service.interface"

@injectable()
export class PurchaseOrderAnalyticsService implements IPurchaseOrderAnalyticsService {
  // Late-bound to avoid a constructor-level circular dependency with
  // PurchaseOrderService: the service holds a reference to analytics (for
  // stats/history/pending-deliveries), and analytics holds a reference back
  // to the service so `receivePurchaseOrder` can delegate to the canonical
  // implementation. The DI container resolves via `registerInstance`, so the
  // `@inject` metadata here is used when analytics is constructed via the
  // container; the module-level singleton below performs the back-assignment
  // manually after both singletons exist.
  private _purchaseOrderService: IPurchaseOrderService | undefined

  constructor(
    @inject(TOKENS.IPurchaseOrderService)
    purchaseOrderService?: IPurchaseOrderService
  ) {
    this._purchaseOrderService = purchaseOrderService
  }

  setPurchaseOrderService(service: IPurchaseOrderService): void {
    this._purchaseOrderService = service
  }

  private get purchaseOrderService(): IPurchaseOrderService {
    if (!this._purchaseOrderService) {
      throw new Error("PurchaseOrderAnalyticsService: purchaseOrderService has not been wired yet")
    }
    return this._purchaseOrderService
  }

  // Delegates to the canonical implementation on IPurchaseOrderService.
  // The `updateStatus` callback is kept for interface compatibility but is
  // unused — the service uses its own `updatePurchaseOrderStatus` internally.
  async receivePurchaseOrder(
    id: string,
    items: POReceiptItem[],
    receivedBy: string | undefined,
    _updateStatus: (
      id: string,
      status: PurchaseOrder["status"],
      changedBy?: string,
      reason?: string
    ) => Promise<unknown>
  ): Promise<POReceiptResult> {
    return this.purchaseOrderService.receivePurchaseOrder(id, items, receivedBy)
  }

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
