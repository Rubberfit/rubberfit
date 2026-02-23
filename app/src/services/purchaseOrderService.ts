import {
  supabase,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type PurchaseOrderWithDetails,
  type PurchaseOrderItemWithDetails,
  type CreatePurchaseOrder,
  type UpdatePurchaseOrder,
  type CreatePurchaseOrderItem,
  type UpdatePurchaseOrderItem,
  type Roll
} from '@/lib/supabase';
import { taxService } from './taxService';
import { getCurrentUserId } from '@/lib/getCurrentUserId';

interface POStatusChange {
  fromStatus: PurchaseOrder['status'];
  toStatus: PurchaseOrder['status'];
  changedBy?: string;
  reason?: string;
  timestamp: string;
}

export interface POReceiptResult {
  purchaseOrderId: string;
  itemsReceived: number;
  rollsCreated: Roll[];
  partialReceipt: boolean;
  completedAt?: string;
}

export const purchaseOrderService = {
  // CRUD for Purchase Orders
  async getAllPurchaseOrders() {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(id, name),
          items:purchase_order_items(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transform to include items_count
      const ordersWithCount = data?.map(order => ({
        ...order,
        items_count: order.items?.[0]?.count || 0
      }));

      return ordersWithCount as PurchaseOrderWithDetails[];
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      throw error;
    }
  },

  async getPurchaseOrdersByStatus(status: PurchaseOrder['status']) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(id, name),
          items:purchase_order_items(*)
        `)
        .eq('status', status)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    } catch (error) {
      console.error('Error fetching purchase orders by status:', error);
      throw error;
    }
  },

  async getPurchaseOrderById(id: string) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(*),
          items:purchase_order_items(
            *,
            material_type:material_types(*)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as PurchaseOrderWithDetails;
    } catch (error) {
      console.error('Error fetching purchase order by ID:', error);
      throw error;
    }
  },

  async createPurchaseOrder(order: CreatePurchaseOrder) {
    try {
      // Generate PO number if not provided
      const poNumber = await this.generatePONumber();
      const user_id = await getCurrentUserId();

      const { data, error } = await supabase
        .from('purchase_orders')
        .insert([{
          ...order,
          user_id,
          po_number: poNumber,
          status: order.status || 'draft'
        }])
        .select(`
          *,
          supplier:suppliers(id, name)
        `)
        .single();

      if (error) throw error;
      return data as PurchaseOrderWithDetails;
    } catch (error) {
      console.error('Error creating purchase order:', error);
      throw error;
    }
  },

  async updatePurchaseOrder(id: string, updates: UpdatePurchaseOrder) {
    try {
      // Recalculate totals if items changed
      if (updates.subtotal !== undefined) {
        // Get the PO to find the supplier ID if not in updates
        let supplierId = updates.supplier_id;
        if (!supplierId) {
          const { data: po, error: poError } = await supabase
            .from('purchase_orders')
            .select('supplier_id')
            .eq('id', id)
            .single();

          if (poError) throw poError;
          supplierId = po.supplier_id;
        }

        // Calculate tax using the tax service
        if (supplierId) {
          const taxCalc = await taxService.calculatePurchaseOrderTax(supplierId, updates.subtotal);
          updates.tax_amount = taxCalc.taxAmount;
          updates.total_amount = updates.subtotal + taxCalc.taxAmount + (updates.shipping_cost || 0);
        } else {
          // Fallback to default 8% if no supplier ID
          updates.tax_amount = updates.subtotal * 0.08;
          updates.total_amount = updates.subtotal + updates.tax_amount + (updates.shipping_cost || 0);
        }
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select(`
          *,
          supplier:suppliers(id, name)
        `)
        .single();

      if (error) throw error;
      return data as PurchaseOrderWithDetails;
    } catch (error) {
      console.error('Error updating purchase order:', error);
      throw error;
    }
  },

  async deletePurchaseOrder(id: string) {
    try {
      // Check if PO can be deleted (only draft or cancelled)
      const { data: po, error: checkError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', id)
        .single();

      if (checkError) throw checkError;

      if (po.status !== 'draft' && po.status !== 'cancelled') {
        throw new Error(`Cannot delete purchase order with status: ${po.status}`);
      }

      // Delete items first (cascade should handle this but being explicit)
      await supabase
        .from('purchase_order_items')
        .delete()
        .eq('purchase_order_id', id);

      // Delete the PO
      const { error } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      throw error;
    }
  },

  // Purchase Order Items Management
  async addItemToPurchaseOrder(item: CreatePurchaseOrderItem) {
    try {
      // Calculate line total
      const lineTotal = item.quantity_sqft * item.unit_cost;
      const user_id = await getCurrentUserId();

      // Get next line number
      const { data: existingItems, error: countError } = await supabase
        .from('purchase_order_items')
        .select('line_number')
        .eq('purchase_order_id', item.purchase_order_id)
        .order('line_number', { ascending: false })
        .limit(1);

      if (countError) throw countError;

      const nextLineNumber = existingItems && existingItems.length > 0
        ? existingItems[0].line_number + 1
        : 1;

      const { data, error } = await supabase
        .from('purchase_order_items')
        .insert([{
          ...item,
          user_id,
          line_number: nextLineNumber,
          line_total: lineTotal,
          quantity_received: 0
        }])
        .select(`
          *,
          material_type:material_types(*)
        `)
        .single();

      if (error) throw error;

      // Update PO totals
      await this.recalculatePOTotals(item.purchase_order_id);

      return data as PurchaseOrderItemWithDetails;
    } catch (error) {
      console.error('Error adding item to purchase order:', error);
      throw error;
    }
  },

  async updatePurchaseOrderItem(id: string, updates: UpdatePurchaseOrderItem) {
    try {
      // Recalculate line total if quantity or unit cost changed
      let lineTotal;
      if (updates.quantity_sqft !== undefined || updates.unit_cost !== undefined) {
        // Get current values if not in updates
        const { data: currentItem } = await supabase
          .from('purchase_order_items')
          .select('quantity_sqft, unit_cost')
          .eq('id', id)
          .single();

        const quantity = updates.quantity_sqft ?? currentItem?.quantity_sqft ?? 0;
        const unitCost = updates.unit_cost ?? currentItem?.unit_cost ?? 0;
        lineTotal = quantity * unitCost;
      }

      const { data, error } = await supabase
        .from('purchase_order_items')
        .update({
          ...updates,
          ...(lineTotal !== undefined && { line_total: lineTotal })
        })
        .eq('id', id)
        .select(`
          *,
          material_type:material_types(*)
        `)
        .single();

      if (error) throw error;

      // Update PO totals
      if (data) {
        await this.recalculatePOTotals(data.purchase_order_id);
      }

      return data as PurchaseOrderItemWithDetails;
    } catch (error) {
      console.error('Error updating purchase order item:', error);
      throw error;
    }
  },

  async deletePurchaseOrderItem(id: string) {
    try {
      // Get PO ID before deletion
      const { data: item, error: fetchError } = await supabase
        .from('purchase_order_items')
        .select('purchase_order_id')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Update PO totals
      if (item) {
        await this.recalculatePOTotals(item.purchase_order_id);
      }

      return true;
    } catch (error) {
      console.error('Error deleting purchase order item:', error);
      throw error;
    }
  },

  // Status Management
  async updatePurchaseOrderStatus(
    id: string,
    newStatus: PurchaseOrder['status'],
    changedBy?: string,
    reason?: string
  ): Promise<PurchaseOrder> {
    try {
      // Get current status
      const { data: currentPO, error: fetchError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Validate status transition
      if (!this.isValidStatusTransition(currentPO.status, newStatus)) {
        throw new Error(`Invalid status transition from ${currentPO.status} to ${newStatus}`);
      }

      // Prepare updates
      const updates: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Add approval info if approving
      if (newStatus === 'approved') {
        updates.approved_by = changedBy;
        updates.approved_at = new Date().toISOString();
      }

      // Add order date if ordering
      if (newStatus === 'ordered' && currentPO.status !== 'ordered') {
        updates.order_date = new Date().toISOString();
      }

      // Update the PO
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log status change (if you have an audit table)
      // await this.logStatusChange({ ... });

      return data as PurchaseOrder;
    } catch (error) {
      console.error('Error updating purchase order status:', error);
      throw error;
    }
  },

  async submitForApproval(id: string, submittedBy?: string) {
    return this.updatePurchaseOrderStatus(id, 'pending', submittedBy, 'Submitted for approval');
  },

  async approvePurchaseOrder(id: string, approvedBy?: string) {
    return this.updatePurchaseOrderStatus(id, 'approved', approvedBy, 'Approved');
  },

  async rejectPurchaseOrder(id: string, rejectedBy?: string, reason?: string) {
    return this.updatePurchaseOrderStatus(id, 'draft', rejectedBy, reason || 'Rejected');
  },

  async markAsOrdered(id: string) {
    return this.updatePurchaseOrderStatus(id, 'ordered', undefined, 'Order placed with supplier');
  },

  async cancelPurchaseOrder(id: string, cancelledBy?: string, reason?: string) {
    return this.updatePurchaseOrderStatus(id, 'cancelled', cancelledBy, reason || 'Cancelled');
  },

  // Receive PO and Update Inventory
  async receivePurchaseOrder(
    id: string,
    items: Array<{
      itemId: string;
      quantityReceived: number;
      rollData?: Partial<Roll>;
    }>,
    receivedBy?: string
  ): Promise<POReceiptResult> {
    try {
      const rollsCreated: Roll[] = [];
      const user_id = await getCurrentUserId();

      // Update each item with received quantity
      for (const item of items) {
        // Get item details
        const { data: poItem, error: itemError } = await supabase
          .from('purchase_order_items')
          .select(`
            *,
            material_type:material_types(*),
            purchase_order:purchase_orders(supplier_id)
          `)
          .eq('id', item.itemId)
          .single();

        if (itemError) throw itemError;

        // Update received quantity
        const newQuantityReceived = (poItem.quantity_received || 0) + item.quantityReceived;

        await supabase
          .from('purchase_order_items')
          .update({
            quantity_received: newQuantityReceived,
            received_date: new Date().toISOString()
          })
          .eq('id', item.itemId);

        // Create roll in inventory if specified
        if (item.rollData && item.quantityReceived > 0) {
          // Get supplier name
          const { data: supplier } = await supabase
            .from('suppliers')
            .select('name')
            .eq('id', poItem.purchase_order.supplier_id)
            .single();

          const { data: newRoll, error: rollError } = await supabase
            .from('rolls')
            .insert([{
              user_id,
              material_type_id: poItem.material_type_id,
              material_type: poItem.material_type.name,
              width: item.rollData.width || poItem.width || 60,
              length: item.rollData.length || item.quantityReceived,
              thickness: item.rollData.thickness || poItem.thickness || 0.125,
              color: item.rollData.color || poItem.color,
              location: item.rollData.location || 'Receiving',
              date_received: new Date().toISOString(),
              supplier: supplier?.name || 'Unknown',
              cost_per_sqft: poItem.unit_cost,
              remaining_length: item.rollData.length || item.quantityReceived,
              status: 'active',
              notes: `Received from PO ${id}`
            }])
            .select()
            .single();

          if (rollError) throw rollError;
          if (newRoll) rollsCreated.push(newRoll);
        }
      }

      // Check if PO is fully received
      const { data: allItems, error: checkError } = await supabase
        .from('purchase_order_items')
        .select('quantity_sqft, quantity_received')
        .eq('purchase_order_id', id);

      if (checkError) throw checkError;

      const fullyReceived = allItems?.every(item =>
        (item.quantity_received || 0) >= item.quantity_sqft
      );

      // Update PO status if fully received
      if (fullyReceived) {
        await this.updatePurchaseOrderStatus(id, 'received', receivedBy, 'All items received');

        await supabase
          .from('purchase_orders')
          .update({ actual_delivery_date: new Date().toISOString() })
          .eq('id', id);
      }

      return {
        purchaseOrderId: id,
        itemsReceived: items.length,
        rollsCreated,
        partialReceipt: !fullyReceived,
        completedAt: fullyReceived ? new Date().toISOString() : undefined
      };
    } catch (error) {
      console.error('Error receiving purchase order:', error);
      throw error;
    }
  },

  // Analytics and Reporting
  async getPurchaseOrderStats() {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('status, total_amount');

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        byStatus: {} as Record<string, number>,
        totalValue: 0,
        avgOrderValue: 0
      };

      if (data && data.length > 0) {
        data.forEach(po => {
          stats.byStatus[po.status] = (stats.byStatus[po.status] || 0) + 1;
          stats.totalValue += po.total_amount || 0;
        });

        stats.avgOrderValue = stats.totalValue / data.length;
      }

      return stats;
    } catch (error) {
      console.error('Error getting purchase order stats:', error);
      throw error;
    }
  },

  async getSupplierPurchaseHistory(supplierId: string, limit: number = 10) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          items:purchase_order_items(count)
        `)
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    } catch (error) {
      console.error('Error getting supplier purchase history:', error);
      throw error;
    }
  },

  async getPendingDeliveries() {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(id, name),
          items:purchase_order_items(*)
        `)
        .in('status', ['ordered', 'approved'])
        .order('requested_delivery_date', { ascending: true });

      if (error) throw error;
      return data as PurchaseOrderWithDetails[];
    } catch (error) {
      console.error('Error getting pending deliveries:', error);
      throw error;
    }
  },

  // Helper functions
  async generatePONumber(): Promise<string> {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    // Get count of POs this month
    const startOfMonth = new Date(year, date.getMonth(), 1).toISOString();
    const { count, error } = await supabase
      .from('purchase_orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth);

    const sequence = String((count || 0) + 1).padStart(4, '0');
    return `PO-${year}${month}-${sequence}`;
  },

  async recalculatePOTotals(purchaseOrderId: string) {
    try {
      // Get all items for this PO
      const { data: items, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('line_total')
        .eq('purchase_order_id', purchaseOrderId);

      if (itemsError) throw itemsError;

      // Calculate new subtotal
      const subtotal = items?.reduce((sum, item) => sum + (item.line_total || 0), 0) || 0;

      // Get current PO details including supplier
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('shipping_cost, supplier_id')
        .eq('id', purchaseOrderId)
        .single();

      if (poError) throw poError;

      // Calculate tax using the tax service
      const taxCalc = await taxService.calculatePurchaseOrderTax(po.supplier_id, subtotal);
      const shippingCost = po?.shipping_cost || 0;
      const totalAmount = subtotal + taxCalc.taxAmount + shippingCost;

      // Update PO totals
      await supabase
        .from('purchase_orders')
        .update({
          subtotal,
          tax_amount: taxCalc.taxAmount,
          total_amount: totalAmount
        })
        .eq('id', purchaseOrderId);
    } catch (error) {
      console.error('Error recalculating PO totals:', error);
      throw error;
    }
  },

  isValidStatusTransition(from: PurchaseOrder['status'], to: PurchaseOrder['status']): boolean {
    const validTransitions: Record<PurchaseOrder['status'], PurchaseOrder['status'][]> = {
      'draft': ['pending', 'cancelled'],
      'pending': ['approved', 'draft', 'cancelled'],
      'approved': ['ordered', 'cancelled'],
      'ordered': ['received', 'cancelled'],
      'received': [],
      'cancelled': ['draft']
    };

    return validTransitions[from]?.includes(to) || false;
  },

  // Get tax calculation details for a purchase order
  async getPurchaseOrderTaxDetails(supplierId: string, subtotal: number) {
    try {
      return await taxService.calculatePurchaseOrderTax(supplierId, subtotal);
    } catch (error) {
      console.error('Error getting PO tax details:', error);
      throw error;
    }
  }
};