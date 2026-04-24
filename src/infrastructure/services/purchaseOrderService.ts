/* eslint-disable max-lines -- canonical PO service aggregates CRUD + status + receive flows; follow-up may extract a `_receive.ts` helper */
import {
  supabase,
  type PurchaseOrder,
  type PurchaseOrderWithDetails,
  type PurchaseOrderItemWithDetails,
  type CreatePurchaseOrder,
  type UpdatePurchaseOrder,
  type CreatePurchaseOrderItem,
  type UpdatePurchaseOrderItem,
  type Roll,
} from "@/src/infrastructure/models/supabase"
import { taxService } from "./taxService"
import { getCurrentUserId } from "@/src/infrastructure/services/getCurrentUserId"
import { purchaseOrderAnalytics } from "./purchaseOrderAnalytics"
import { generatePoNumber } from "./generatePoNumber"
import type {
  IPurchaseOrderService,
  POReceiptItem,
  POReceiptResult,
} from "@/src/application/services/purchase-order.service.interface"
import type { ITaxService } from "@/src/application/services/tax.service.interface"
import type { IPurchaseOrderAnalyticsService } from "@/src/application/services/purchase-order-analytics.service.interface"
import "reflect-metadata"
import { injectable, inject } from "tsyringe"
import { TOKENS } from "@/di/tokens"

export type { POReceiptResult }

@injectable()
export class PurchaseOrderService implements IPurchaseOrderService {
  constructor(
    @inject(TOKENS.ITaxService) private readonly taxService: ITaxService,
    @inject(TOKENS.IPurchaseOrderAnalyticsService)
    private readonly analytics: IPurchaseOrderAnalyticsService
  ) {}
  async getAllPurchaseOrders(): Promise<PurchaseOrderWithDetails[]> {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          supplier:suppliers(id, name),
          items:purchase_order_items(count)
        `
        )
        .order("created_at", { ascending: false })

      if (error) throw error

      const ordersWithCount = data?.map((order: Record<string, any>) => ({
        ...order,
        items_count: order.items?.[0]?.count || 0,
      }))

      return ordersWithCount as PurchaseOrderWithDetails[]
    } catch (error) {
      console.error("Error fetching purchase orders:", error)
      throw error
    }
  }

  async getPurchaseOrdersByStatus(
    status: PurchaseOrder["status"]
  ): Promise<PurchaseOrderWithDetails[]> {
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
        .eq("status", status)
        .order("created_at", { ascending: false })

      if (error) throw error
      return data as PurchaseOrderWithDetails[]
    } catch (error) {
      console.error("Error fetching purchase orders by status:", error)
      throw error
    }
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderWithDetails> {
    try {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(
          `
          *,
          supplier:suppliers(*),
          items:purchase_order_items(
            *,
            material_type:material_types(*)
          )
        `
        )
        .eq("id", id)
        .single()

      if (error) throw error
      return data as PurchaseOrderWithDetails
    } catch (error) {
      console.error("Error fetching purchase order by ID:", error)
      throw error
    }
  }

  async createPurchaseOrder(order: CreatePurchaseOrder): Promise<PurchaseOrderWithDetails> {
    try {
      const poNumber = await this.generatePONumber()
      const user_id = await getCurrentUserId()

      const { data, error } = await supabase
        .from("purchase_orders")
        .insert([
          {
            ...order,
            user_id,
            po_number: poNumber,
            status: order.status || "draft",
          },
        ])
        .select(
          `
          *,
          supplier:suppliers(id, name)
        `
        )
        .single()

      if (error) throw error
      return data as PurchaseOrderWithDetails
    } catch (error) {
      console.error("Error creating purchase order:", error)
      throw error
    }
  }

  async updatePurchaseOrder(
    id: string,
    updates: UpdatePurchaseOrder
  ): Promise<PurchaseOrderWithDetails> {
    try {
      if (updates.subtotal !== undefined) {
        let supplierId = updates.supplier_id
        if (!supplierId) {
          const { data: po, error: poError } = await supabase
            .from("purchase_orders")
            .select("supplier_id")
            .eq("id", id)
            .single()

          if (poError) throw poError
          supplierId = po.supplier_id
        }

        if (supplierId) {
          const taxCalc = await this.taxService.calculatePurchaseOrderTax(
            supplierId,
            updates.subtotal
          )
          updates.tax_amount = taxCalc.taxAmount
          updates.total_amount = updates.subtotal + taxCalc.taxAmount + (updates.shipping_cost || 0)
        } else {
          updates.tax_amount = updates.subtotal * 0.08
          updates.total_amount =
            updates.subtotal + updates.tax_amount + (updates.shipping_cost || 0)
        }
      }

      const { data, error } = await supabase
        .from("purchase_orders")
        .update(updates)
        .eq("id", id)
        .select(
          `
          *,
          supplier:suppliers(id, name)
        `
        )
        .single()

      if (error) throw error
      return data as PurchaseOrderWithDetails
    } catch (error) {
      console.error("Error updating purchase order:", error)
      throw error
    }
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    try {
      const { data: po, error: checkError } = await supabase
        .from("purchase_orders")
        .select("status")
        .eq("id", id)
        .single()

      if (checkError) throw checkError

      if (po.status !== "draft" && po.status !== "cancelled") {
        throw new Error(`Cannot delete purchase order with status: ${po.status}`)
      }

      await supabase.from("purchase_order_items").delete().eq("purchase_order_id", id)

      const { error } = await supabase.from("purchase_orders").delete().eq("id", id)

      if (error) throw error
      return true
    } catch (error) {
      console.error("Error deleting purchase order:", error)
      throw error
    }
  }

  async addItemToPurchaseOrder(
    item: CreatePurchaseOrderItem
  ): Promise<PurchaseOrderItemWithDetails> {
    try {
      const lineTotal = item.quantity_sqft * item.unit_cost
      const user_id = await getCurrentUserId()

      const { data: existingItems, error: countError } = await supabase
        .from("purchase_order_items")
        .select("line_number")
        .eq("purchase_order_id", item.purchase_order_id)
        .order("line_number", { ascending: false })
        .limit(1)

      if (countError) throw countError

      const nextLineNumber =
        existingItems && existingItems.length > 0 ? existingItems[0].line_number + 1 : 1

      const { data, error } = await supabase
        .from("purchase_order_items")
        .insert([
          {
            ...item,
            user_id,
            line_number: nextLineNumber,
            line_total: lineTotal,
            quantity_received: 0,
          },
        ])
        .select(
          `
          *,
          material_type:material_types(*)
        `
        )
        .single()

      if (error) throw error

      await this.recalculatePOTotals(item.purchase_order_id)

      return data as PurchaseOrderItemWithDetails
    } catch (error) {
      console.error("Error adding item to purchase order:", error)
      throw error
    }
  }

  async updatePurchaseOrderItem(
    id: string,
    updates: UpdatePurchaseOrderItem
  ): Promise<PurchaseOrderItemWithDetails> {
    try {
      let lineTotal
      if (updates.quantity_sqft !== undefined || updates.unit_cost !== undefined) {
        const { data: currentItem } = await supabase
          .from("purchase_order_items")
          .select("quantity_sqft, unit_cost")
          .eq("id", id)
          .single()

        const quantity = updates.quantity_sqft ?? currentItem?.quantity_sqft ?? 0
        const unitCost = updates.unit_cost ?? currentItem?.unit_cost ?? 0
        lineTotal = quantity * unitCost
      }

      const { data, error } = await supabase
        .from("purchase_order_items")
        .update({
          ...updates,
          ...(lineTotal !== undefined && { line_total: lineTotal }),
        })
        .eq("id", id)
        .select(
          `
          *,
          material_type:material_types(*)
        `
        )
        .single()

      if (error) throw error

      if (data) {
        await this.recalculatePOTotals(data.purchase_order_id)
      }

      return data as PurchaseOrderItemWithDetails
    } catch (error) {
      console.error("Error updating purchase order item:", error)
      throw error
    }
  }

  async deletePurchaseOrderItem(id: string): Promise<boolean> {
    try {
      const { data: item, error: fetchError } = await supabase
        .from("purchase_order_items")
        .select("purchase_order_id")
        .eq("id", id)
        .single()

      if (fetchError) throw fetchError

      const { error } = await supabase.from("purchase_order_items").delete().eq("id", id)

      if (error) throw error

      if (item) {
        await this.recalculatePOTotals(item.purchase_order_id)
      }

      return true
    } catch (error) {
      console.error("Error deleting purchase order item:", error)
      throw error
    }
  }

  async updatePurchaseOrderStatus(
    id: string,
    newStatus: PurchaseOrder["status"],
    changedBy?: string,
    _reason?: string
  ): Promise<PurchaseOrder> {
    try {
      const { data: currentPO, error: fetchError } = await supabase
        .from("purchase_orders")
        .select("status")
        .eq("id", id)
        .single()

      if (fetchError) throw fetchError

      if (!this.isValidStatusTransition(currentPO.status, newStatus)) {
        throw new Error(`Invalid status transition from ${currentPO.status} to ${newStatus}`)
      }

      const updates: Partial<CreatePurchaseOrder> & {
        approved_by?: string
        approved_at?: string
        order_date?: string
        updated_at?: string
      } = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === "approved") {
        updates.approved_by = changedBy
        updates.approved_at = new Date().toISOString()
      }

      if (newStatus === "ordered" && currentPO.status !== "ordered") {
        updates.order_date = new Date().toISOString()
      }

      const { data, error } = await supabase
        .from("purchase_orders")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) throw error

      return data as PurchaseOrder
    } catch (error) {
      console.error("Error updating purchase order status:", error)
      throw error
    }
  }

  async submitForApproval(id: string, submittedBy?: string): Promise<PurchaseOrder> {
    return this.updatePurchaseOrderStatus(id, "pending", submittedBy, "Submitted for approval")
  }

  async approvePurchaseOrder(id: string, approvedBy?: string): Promise<PurchaseOrder> {
    return this.updatePurchaseOrderStatus(id, "approved", approvedBy, "Approved")
  }

  async rejectPurchaseOrder(
    id: string,
    rejectedBy?: string,
    reason?: string
  ): Promise<PurchaseOrder> {
    return this.updatePurchaseOrderStatus(id, "draft", rejectedBy, reason || "Rejected")
  }

  async markAsOrdered(id: string): Promise<PurchaseOrder> {
    return this.updatePurchaseOrderStatus(id, "ordered", undefined, "Order placed with supplier")
  }

  async cancelPurchaseOrder(
    id: string,
    cancelledBy?: string,
    reason?: string
  ): Promise<PurchaseOrder> {
    return this.updatePurchaseOrderStatus(id, "cancelled", cancelledBy, reason || "Cancelled")
  }

  // eslint-disable-next-line complexity
  async receivePurchaseOrder(
    id: string,
    items: POReceiptItem[],
    receivedBy?: string
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
        (item: Record<string, any>) => (item.quantity_received || 0) >= item.quantity_sqft
      )

      if (fullyReceived) {
        await this.updatePurchaseOrderStatus(id, "received", receivedBy, "All items received")

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

  async getPurchaseOrderStats() {
    return this.analytics.getPurchaseOrderStats()
  }

  async getSupplierPurchaseHistory(supplierId: string, limit: number = 10) {
    return this.analytics.getSupplierPurchaseHistory(supplierId, limit)
  }

  async getPendingDeliveries() {
    return this.analytics.getPendingDeliveries()
  }

  async generatePONumber(): Promise<string> {
    const date = new Date()
    const year = date.getFullYear()

    const startOfYear = new Date(year, 0, 1).toISOString()
    const { count, error: _error } = await supabase
      .from("purchase_orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfYear)

    const sequence = (count || 0) + 1
    return generatePoNumber(year, sequence)
  }

  async recalculatePOTotals(purchaseOrderId: string): Promise<void> {
    try {
      const { data: items, error: itemsError } = await supabase
        .from("purchase_order_items")
        .select("line_total")
        .eq("purchase_order_id", purchaseOrderId)

      if (itemsError) throw itemsError

      const subtotal =
        items?.reduce(
          (sum: number, item: Record<string, any>) => sum + (item.line_total || 0),
          0
        ) || 0

      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .select("shipping_cost, supplier_id")
        .eq("id", purchaseOrderId)
        .single()

      if (poError) throw poError

      const taxCalc = await this.taxService.calculatePurchaseOrderTax(po.supplier_id, subtotal)
      const shippingCost = po?.shipping_cost || 0
      const totalAmount = subtotal + taxCalc.taxAmount + shippingCost

      await supabase
        .from("purchase_orders")
        .update({
          subtotal,
          tax_amount: taxCalc.taxAmount,
          total_amount: totalAmount,
        })
        .eq("id", purchaseOrderId)
    } catch (error) {
      console.error("Error recalculating PO totals:", error)
      throw error
    }
  }

  isValidStatusTransition(from: PurchaseOrder["status"], to: PurchaseOrder["status"]): boolean {
    const validTransitions: Record<PurchaseOrder["status"], PurchaseOrder["status"][]> = {
      draft: ["pending", "cancelled"],
      pending: ["approved", "draft", "cancelled"],
      approved: ["ordered", "cancelled"],
      ordered: ["received", "cancelled"],
      received: [],
      cancelled: ["draft"],
    }

    return validTransitions[from]?.includes(to) || false
  }

  async existsItemsByMaterialType(materialTypeId: string): Promise<boolean> {
    const { count, error } = await supabase
      .from("purchase_order_items")
      .select("id", { count: "exact", head: true })
      .eq("material_type_id", materialTypeId)

    if (error) throw error
    return (count ?? 0) > 0
  }

  async getPurchaseOrderTaxDetails(supplierId: string, subtotal: number): Promise<unknown> {
    try {
      return await this.taxService.calculatePurchaseOrderTax(supplierId, subtotal)
    } catch (error) {
      console.error("Error getting PO tax details:", error)
      throw error
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService(taxService, purchaseOrderAnalytics)

// Late-bind the service back-reference so analytics.receivePurchaseOrder can
// delegate to the canonical implementation. Both module-level singletons
// cannot take each other as constructor args, so this final wire-up step
// closes the cycle.
purchaseOrderAnalytics.setPurchaseOrderService(purchaseOrderService)
