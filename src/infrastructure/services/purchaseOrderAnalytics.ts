import {
  supabase,
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type Roll,
} from "@/src/infrastructure/models/supabase"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import type { POReceiptItem, POReceiptResult } from "@/src/application/services/purchase-order.service.interface"
import type {
  IPurchaseOrderAnalyticsService,
  POAnalyticsStats,
} from "@/src/application/services/purchase-order-analytics.service.interface"

export class PurchaseOrderAnalyticsService implements IPurchaseOrderAnalyticsService {
  // eslint-disable-next-line complexity
  async receivePurchaseOrder(
    id: string,
    items: POReceiptItem[],
    receivedBy: string | undefined,
    updateStatus: (
      id: string,
      status: PurchaseOrder["status"],
      changedBy?: string,
      reason?: string
    ) => Promise<unknown>
  ): Promise<POReceiptResult> {
    try {
      const rollsCreated: Roll[] = []
      const user_id = await getCurrentUserId()

      for (const item of items) {
        const { data: poItem, error: itemError } = await supabase
          .from("purchase_order_items")
          .select(
            `
            *,
            material_type:material_types(*),
            purchase_order:purchase_orders(supplier_id)
          `
          )
          .eq("id", item.itemId)
          .single()

        if (itemError) throw itemError

        const newQuantityReceived = (poItem.quantity_received || 0) + item.quantityReceived

        await supabase
          .from("purchase_order_items")
          .update({
            quantity_received: newQuantityReceived,
            received_date: new Date().toISOString(),
          })
          .eq("id", item.itemId)

        if (item.rollData && item.quantityReceived > 0) {
          const { data: supplier } = await supabase
            .from("suppliers")
            .select("name")
            .eq("id", poItem.purchase_order.supplier_id)
            .single()

          const { data: newRoll, error: rollError } = await supabase
            .from("rolls")
            .insert([
              {
                user_id,
                material_type_id: poItem.material_type_id,
                material_type: poItem.material_type.name,
                width: item.rollData.width || poItem.width || 60,
                length: item.rollData.length || item.quantityReceived,
                thickness: item.rollData.thickness || poItem.thickness || 0.125,
                color: item.rollData.color || poItem.color,
                location: item.rollData.location || "Receiving",
                date_received: new Date().toISOString(),
                supplier: supplier?.name || "Unknown",
                cost_per_sqft: poItem.unit_cost,
                remaining_length: item.rollData.length || item.quantityReceived,
                status: "active",
                notes: `Received from PO ${id}`,
              },
            ])
            .select()
            .single()

          if (rollError) throw rollError
          if (newRoll) rollsCreated.push(newRoll)
        }
      }

      const { data: allItems, error: checkError } = await supabase
        .from("purchase_order_items")
        .select("quantity_sqft, quantity_received")
        .eq("purchase_order_id", id)

      if (checkError) throw checkError

      const fullyReceived = allItems?.every(
        (item) => (item.quantity_received || 0) >= item.quantity_sqft
      )

      if (fullyReceived) {
        await updateStatus(id, "received", receivedBy, "All items received")

        await supabase
          .from("purchase_orders")
          .update({ actual_delivery_date: new Date().toISOString() })
          .eq("id", id)
      }

      return {
        purchaseOrderId: id,
        itemsReceived: items.length,
        rollsCreated,
        partialReceipt: !fullyReceived,
        completedAt: fullyReceived ? new Date().toISOString() : undefined,
      }
    } catch (error) {
      console.error("Error receiving purchase order:", error)
      throw error
    }
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
        data.forEach((po) => {
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
