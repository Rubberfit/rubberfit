import {
  supabase,
  type ReorderRule,
  type ReorderRuleWithDetails,
  type CreateReorderRule,
  type UpdateReorderRule,
  type MaterialType,
  type Roll,
  type PurchaseOrder
} from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/getCurrentUserId';

export interface ReorderSuggestion {
  materialTypeId: string;
  materialName: string;
  currentStock: number;
  reorderPoint: number;
  suggestedQuantity: number;
  supplierId?: string;
  supplierName?: string;
  estimatedCost: number;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  reason: string;
  reorderRuleId?: string;
}

export interface OptimalOrderQuantity {
  quantity: number;
  reasoning: string;
  costSavings?: number;
  bulkDiscountApplied: boolean;
}

export const reorderService = {
  // CRUD for Reorder Rules
  async getAllReorderRules() {
    try {
      const { data, error } = await supabase
        .from('reorder_rules')
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ReorderRuleWithDetails[];
    } catch (error) {
      console.error('Error fetching reorder rules:', error);
      throw error;
    }
  },

  async getActiveReorderRules() {
    try {
      const { data, error } = await supabase
        .from('reorder_rules')
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .eq('active', true)
        .order('material_type_id', { ascending: true });

      if (error) throw error;
      return data as ReorderRuleWithDetails[];
    } catch (error) {
      console.error('Error fetching active reorder rules:', error);
      throw error;
    }
  },

  async getReorderRuleById(id: string) {
    try {
      const { data, error } = await supabase
        .from('reorder_rules')
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as ReorderRuleWithDetails;
    } catch (error) {
      console.error('Error fetching reorder rule by ID:', error);
      throw error;
    }
  },

  async getReorderRuleByMaterial(materialTypeId: string) {
    try {
      const { data, error } = await supabase
        .from('reorder_rules')
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .eq('material_type_id', materialTypeId)
        .eq('active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as ReorderRuleWithDetails | null;
    } catch (error) {
      console.error('Error fetching reorder rule by material:', error);
      throw error;
    }
  },

  async createReorderRule(rule: CreateReorderRule) {
    try {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabase
        .from('reorder_rules')
        .insert([{ ...rule, user_id }])
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .single();

      if (error) throw error;
      return data as ReorderRuleWithDetails;
    } catch (error) {
      console.error('Error creating reorder rule:', error);
      throw error;
    }
  },

  async updateReorderRule(id: string, updates: UpdateReorderRule) {
    try {
      const user_id = await getCurrentUserId();
      const { data, error } = await supabase
        .from('reorder_rules')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user_id)
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .single();

      if (error) {
        console.error('Error updating reorder rule:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return data as ReorderRuleWithDetails;
    } catch (error: any) {
      console.error('Error updating reorder rule:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      throw error;
    }
  },

  async deleteReorderRule(id: string) {
    try {
      const user_id = await getCurrentUserId();
      const { error } = await supabase
        .from('reorder_rules')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('Error deleting reorder rule:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw error;
      }
      return true;
    } catch (error: any) {
      console.error('Error deleting reorder rule:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
      });
      throw error;
    }
  },

  // Check materials against reorder points
  async checkReorderPoints(): Promise<ReorderSuggestion[]> {
    try {
      // Get all active reorder rules
      const { data: rules, error: rulesError } = await supabase
        .from('reorder_rules')
        .select(`
          *,
          material_type:material_types(*),
          supplier:suppliers(*)
        `)
        .eq('active', true);

      if (rulesError) throw rulesError;
      if (!rules || rules.length === 0) return [];

      const suggestions: ReorderSuggestion[] = [];

      for (const rule of rules) {
        // Calculate current stock for this material
        const currentStock = await this.calculateCurrentStock(rule.material_type_id);

        // Check if we're below reorder point
        if (currentStock <= rule.reorder_point) {
          // Calculate suggested quantity
          const suggestedQuantity = this.calculateSuggestedQuantity(
            currentStock,
            rule.reorder_point,
            rule.reorder_quantity,
            rule.max_stock_level
          );

          // Estimate cost
          const estimatedCost = await this.estimateReorderCost(
            rule.material_type_id,
            suggestedQuantity,
            rule.supplier_id
          );

          // Determine urgency
          const urgency = this.determineUrgency(
            currentStock,
            rule.reorder_point,
            rule.safety_stock_days
          );

          suggestions.push({
            materialTypeId: rule.material_type_id,
            materialName: rule.material_type?.name || 'Unknown',
            currentStock,
            reorderPoint: rule.reorder_point,
            suggestedQuantity,
            supplierId: rule.supplier_id,
            supplierName: rule.supplier?.name,
            estimatedCost,
            urgency,
            reason: this.generateReorderReason(currentStock, rule.reorder_point),
            reorderRuleId: rule.id
          });
        }
      }

      // Sort by urgency
      return suggestions.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });
    } catch (error) {
      console.error('Error checking reorder points:', error);
      throw error;
    }
  },

  // Generate reorder suggestions
  async generateReorderSuggestions(includeInactive: boolean = false): Promise<ReorderSuggestion[]> {
    try {
      // Get materials with or without rules
      const { data: materials, error: matError } = await supabase
        .from('material_types')
        .select('*');

      if (matError) throw matError;
      if (!materials || materials.length === 0) return [];

      const suggestions: ReorderSuggestion[] = [];

      for (const material of materials) {
        const currentStock = await this.calculateCurrentStock(material.id);
        const rule = await this.getReorderRuleByMaterial(material.id);

        if (rule && rule.active) {
          // Use existing rule
          if (currentStock <= rule.reorder_point) {
            const suggestedQuantity = this.calculateSuggestedQuantity(
              currentStock,
              rule.reorder_point,
              rule.reorder_quantity,
              rule.max_stock_level
            );

            const estimatedCost = await this.estimateReorderCost(
              material.id,
              suggestedQuantity,
              rule.supplier_id
            );

            suggestions.push({
              materialTypeId: material.id,
              materialName: material.name,
              currentStock,
              reorderPoint: rule.reorder_point,
              suggestedQuantity,
              supplierId: rule.supplier_id,
              supplierName: rule.supplier?.name,
              estimatedCost,
              urgency: this.determineUrgency(currentStock, rule.reorder_point, rule.safety_stock_days),
              reason: this.generateReorderReason(currentStock, rule.reorder_point),
              reorderRuleId: rule.id
            });
          }
        } else if (includeInactive && material.min_stock_alert) {
          // Use material's min_stock_alert as a basic reorder point
          if (currentStock <= material.min_stock_alert) {
            const suggestedQuantity = material.min_stock_alert * 2; // Simple 2x rule
            const estimatedCost = await this.estimateReorderCost(material.id, suggestedQuantity, undefined);

            suggestions.push({
              materialTypeId: material.id,
              materialName: material.name,
              currentStock,
              reorderPoint: material.min_stock_alert,
              suggestedQuantity,
              estimatedCost,
              urgency: currentStock === 0 ? 'critical' : 'normal',
              reason: `Stock below minimum alert level (${material.min_stock_alert} sq ft)`
            });
          }
        }
      }

      return suggestions.sort((a, b) => {
        const urgencyOrder = { critical: 0, high: 1, normal: 2, low: 3 };
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      });
    } catch (error) {
      console.error('Error generating reorder suggestions:', error);
      throw error;
    }
  },

  // Create purchase orders automatically
  async createAutomaticPurchaseOrder(suggestion: ReorderSuggestion) {
    try {
      if (!suggestion.supplierId) {
        throw new Error('Cannot create purchase order without supplier');
      }

      // Generate PO number
      const poNumber = await this.generatePONumber();

      // Calculate dates
      const orderDate = new Date().toISOString();
      const requestedDeliveryDate = new Date();

      // Get lead time from reorder rule or use default
      let leadTimeDays = 7;
      if (suggestion.reorderRuleId) {
        const rule = await this.getReorderRuleById(suggestion.reorderRuleId);
        leadTimeDays = rule.lead_time_days;
      }

      requestedDeliveryDate.setDate(requestedDeliveryDate.getDate() + leadTimeDays);

      // Get material details for the PO item
      const { data: material, error: matError } = await supabase
        .from('material_types')
        .select('*')
        .eq('id', suggestion.materialTypeId)
        .single();

      if (matError) throw matError;

      // Calculate costs (simplified - in production, consider tax, shipping, etc.)
      const unitCost = suggestion.estimatedCost / suggestion.suggestedQuantity;
      const subtotal = suggestion.estimatedCost;
      const taxRate = 0.08; // 8% tax - should be configurable
      const taxAmount = subtotal * taxRate;
      const totalAmount = subtotal + taxAmount;

      // Create the purchase order
      const user_id = await getCurrentUserId();
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          user_id,
          po_number: poNumber,
          supplier_id: suggestion.supplierId,
          status: 'draft',
          order_date: orderDate,
          requested_delivery_date: requestedDeliveryDate.toISOString(),
          subtotal,
          tax_amount: taxAmount,
          shipping_cost: 0,
          total_amount: totalAmount,
          auto_generated: true,
          reorder_rule_id: suggestion.reorderRuleId,
          notes: `Auto-generated PO: ${suggestion.reason}`
        }])
        .select()
        .single();

      if (poError) throw poError;

      // Create the purchase order item
      const { data: poItem, error: itemError } = await supabase
        .from('purchase_order_items')
        .insert([{
          user_id,
          purchase_order_id: po.id,
          material_type_id: suggestion.materialTypeId,
          line_number: 1,
          description: material.name,
          quantity_sqft: suggestion.suggestedQuantity,
          unit_cost: unitCost,
          line_total: subtotal,
          quantity_received: 0
        }])
        .select()
        .single();

      if (itemError) throw itemError;

      // Update reorder rule last triggered timestamp if applicable
      if (suggestion.reorderRuleId) {
        await supabase
          .from('reorder_rules')
          .update({ last_triggered_at: new Date().toISOString() })
          .eq('id', suggestion.reorderRuleId);
      }

      return po as PurchaseOrder;
    } catch (error) {
      console.error('Error creating automatic purchase order:', error);
      throw error;
    }
  },

  // Calculate optimal order quantities
  async calculateOptimalOrderQuantity(
    materialTypeId: string,
    supplierId?: string
  ): Promise<OptimalOrderQuantity> {
    try {
      // Get historical usage data (simplified EOQ calculation)
      const { data: cuts, error: cutsError } = await supabase
        .from('cuts')
        .select('total_sqft_used, created_at')
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()); // Last 90 days

      if (cutsError) throw cutsError;

      // Calculate average daily usage
      const totalUsage = cuts?.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0) || 0;
      const avgDailyUsage = totalUsage / 90;

      // Get supplier pricing info if available
      let orderingCost = 50; // Default ordering cost
      let holdingCostRate = 0.25; // 25% annual holding cost rate
      let unitCost = 10; // Default cost per sqft

      if (supplierId) {
        const { data: supplierInfo } = await supabase
          .from('material_suppliers')
          .select('cost_per_sqft, minimum_order_sqft')
          .eq('material_type_id', materialTypeId)
          .eq('supplier_id', supplierId)
          .single();

        if (supplierInfo) {
          unitCost = supplierInfo.cost_per_sqft;
        }
      }

      // Economic Order Quantity (EOQ) formula
      // EOQ = sqrt((2 * D * S) / H)
      // D = Annual demand
      // S = Ordering cost per order
      // H = Holding cost per unit per year
      const annualDemand = avgDailyUsage * 365;
      const holdingCost = unitCost * holdingCostRate;

      let eoq = 0;
      if (annualDemand > 0 && holdingCost > 0) {
        eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
      }

      // Round to practical quantity (nearest 100 sqft)
      const optimalQuantity = Math.max(100, Math.round(eoq / 100) * 100);

      // Check for bulk discounts (simplified)
      let bulkDiscountApplied = false;
      let costSavings = 0;

      if (optimalQuantity >= 1000) {
        bulkDiscountApplied = true;
        costSavings = optimalQuantity * unitCost * 0.05; // 5% discount
      }

      const reasoning = this.generateOptimalQuantityReasoning(
        avgDailyUsage,
        optimalQuantity,
        bulkDiscountApplied
      );

      return {
        quantity: optimalQuantity,
        reasoning,
        costSavings,
        bulkDiscountApplied
      };
    } catch (error) {
      console.error('Error calculating optimal order quantity:', error);
      // Return a safe default
      return {
        quantity: 500,
        reasoning: 'Using default quantity due to insufficient data',
        bulkDiscountApplied: false
      };
    }
  },

  // Bulk update reorder rules
  async bulkUpdateReorderRules(updates: Array<{ id: string; updates: UpdateReorderRule }>) {
    try {
      const results = [];

      for (const update of updates) {
        const result = await this.updateReorderRule(update.id, update.updates);
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('Error bulk updating reorder rules:', error);
      throw error;
    }
  },

  // Helper functions
  async calculateCurrentStock(materialTypeId: string): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('rolls')
        .select('width, remaining_length')
        .eq('material_type_id', materialTypeId)
        .eq('status', 'active');

      if (error) throw error;

      if (!data || data.length === 0) return 0;

      return data.reduce((total, roll) => {
        const sqft = (roll.width * roll.remaining_length) / 144;
        return total + sqft;
      }, 0);
    } catch (error) {
      console.error('Error calculating current stock:', error);
      return 0;
    }
  },

  calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    reorderQuantity: number,
    maxStock?: number
  ): number {
    // Base quantity is the configured reorder quantity
    let suggested = reorderQuantity;

    // If we're critically low, order more
    if (currentStock <= reorderPoint * 0.25) {
      suggested = reorderQuantity * 1.5;
    }

    // Don't exceed max stock if configured
    if (maxStock && currentStock + suggested > maxStock) {
      suggested = Math.max(0, maxStock - currentStock);
    }

    // Round to nearest 10 sqft for practicality
    return Math.round(suggested / 10) * 10;
  },

  async estimateReorderCost(
    materialTypeId: string,
    quantity: number,
    supplierId?: string
  ): Promise<number> {
    try {
      let costPerSqft = 10; // Default cost

      if (supplierId) {
        const { data } = await supabase
          .from('material_suppliers')
          .select('cost_per_sqft')
          .eq('material_type_id', materialTypeId)
          .eq('supplier_id', supplierId)
          .single();

        if (data) {
          costPerSqft = data.cost_per_sqft;
        }
      } else {
        // Use lowest available price
        const { data } = await supabase
          .from('material_suppliers')
          .select('cost_per_sqft')
          .eq('material_type_id', materialTypeId)
          .eq('active', true)
          .order('cost_per_sqft', { ascending: true })
          .limit(1)
          .single();

        if (data) {
          costPerSqft = data.cost_per_sqft;
        }
      }

      return quantity * costPerSqft;
    } catch (error) {
      console.error('Error estimating reorder cost:', error);
      return quantity * 10; // Fallback to default
    }
  },

  determineUrgency(
    currentStock: number,
    reorderPoint: number,
    safetyStockDays: number
  ): 'critical' | 'high' | 'normal' | 'low' {
    const stockRatio = currentStock / reorderPoint;

    if (currentStock === 0) return 'critical';
    if (stockRatio <= 0.25) return 'high';
    if (stockRatio <= 0.5) return 'normal';
    return 'low';
  },

  generateReorderReason(currentStock: number, reorderPoint: number): string {
    const percentage = ((reorderPoint - currentStock) / reorderPoint * 100).toFixed(1);

    if (currentStock === 0) {
      return 'Out of stock - immediate reorder required';
    }
    if (currentStock < reorderPoint * 0.25) {
      return `Critically low stock - ${percentage}% below reorder point`;
    }
    if (currentStock < reorderPoint * 0.5) {
      return `Low stock warning - ${percentage}% below reorder point`;
    }
    return `Stock at reorder point (${currentStock.toFixed(0)} sq ft)`;
  },

  generateOptimalQuantityReasoning(
    avgDailyUsage: number,
    optimalQuantity: number,
    bulkDiscountApplied: boolean
  ): string {
    const daysSupply = avgDailyUsage > 0 ? Math.round(optimalQuantity / avgDailyUsage) : 0;

    let reasoning = `Based on average daily usage of ${avgDailyUsage.toFixed(1)} sq ft, `;
    reasoning += `ordering ${optimalQuantity} sq ft provides approximately ${daysSupply} days of supply. `;

    if (bulkDiscountApplied) {
      reasoning += 'Bulk discount applied for quantity over 1000 sq ft.';
    }

    return reasoning;
  },

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
  }
};