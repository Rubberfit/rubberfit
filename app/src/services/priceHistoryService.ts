import {
  supabase,
  type PriceHistory,
  type MaterialSupplier,
  type MaterialSupplierWithDetails
} from '@/lib/supabase';
import { getCurrentUserId } from '@/lib/getCurrentUserId';

interface PriceTrend {
  materialTypeId: string;
  supplierId: string;
  currentPrice: number;
  previousPrice: number;
  changeAmount: number;
  changePercentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  priceHistory: PriceHistory[];
}

interface BestPriceOption {
  supplierId: string;
  supplierName: string;
  materialSupplierId: string;
  costPerSqft: number;
  leadTimeDays: number;
  minimumOrderSqft: number;
  isPreferred: boolean;
  lastPriceChange?: {
    date: string;
    changePercentage: number;
  };
}

export const priceHistoryService = {
  // Track price changes
  async trackPriceChange(
    materialSupplierId: string,
    oldPrice: number | undefined,
    newPrice: number,
    changeReason?: string,
    changedBy?: string
  ) {
    try {
      const priceChangePercentage = oldPrice
        ? ((newPrice - oldPrice) / oldPrice) * 100
        : undefined;

      const user_id = await getCurrentUserId();
      const { data, error } = await supabase
        .from('price_history')
        .insert([{
          user_id,
          material_supplier_id: materialSupplierId,
          old_cost_per_sqft: oldPrice,
          new_cost_per_sqft: newPrice,
          price_change_percentage: priceChangePercentage,
          change_reason: changeReason,
          effective_date: new Date().toISOString(),
          changed_by: changedBy
        }])
        .select()
        .single();

      if (error) throw error;
      return data as PriceHistory;
    } catch (error) {
      console.error('Error tracking price change:', error);
      throw error;
    }
  },

  // Get price history for a material-supplier combination
  async getPriceHistory(materialSupplierId: string, limit?: number) {
    try {
      let query = supabase
        .from('price_history')
        .select('*')
        .eq('material_supplier_id', materialSupplierId)
        .order('effective_date', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PriceHistory[];
    } catch (error) {
      console.error('Error fetching price history:', error);
      throw error;
    }
  },

  // Get price history for a material across all suppliers
  async getMaterialPriceHistory(materialTypeId: string, daysBack: number = 90) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // First get all material-supplier relationships for this material
      const { data: materialSuppliers, error: msError } = await supabase
        .from('material_suppliers')
        .select('id, supplier_id')
        .eq('material_type_id', materialTypeId);

      if (msError) throw msError;

      if (!materialSuppliers || materialSuppliers.length === 0) {
        return [];
      }

      const materialSupplierIds = materialSuppliers.map(ms => ms.id);

      // Get price history for all these material-supplier relationships
      const { data, error } = await supabase
        .from('price_history')
        .select(`
          *,
          material_supplier:material_suppliers!inner(
            supplier:suppliers(id, name)
          )
        `)
        .in('material_supplier_id', materialSupplierIds)
        .gte('effective_date', startDate.toISOString())
        .order('effective_date', { ascending: false });

      if (error) throw error;
      return data as any[];
    } catch (error) {
      console.error('Error fetching material price history:', error);
      throw error;
    }
  },

  // Compare prices across suppliers for a material
  async comparePrices(materialTypeId: string) {
    try {
      const { data, error } = await supabase
        .from('material_suppliers')
        .select(`
          *,
          supplier:suppliers(id, name, rating, preferred)
        `)
        .eq('material_type_id', materialTypeId)
        .eq('active', true)
        .order('cost_per_sqft', { ascending: true });

      if (error) throw error;

      const suppliers = data as MaterialSupplierWithDetails[];

      // Calculate statistics
      if (suppliers.length === 0) {
        return {
          suppliers: [],
          lowestPrice: 0,
          highestPrice: 0,
          averagePrice: 0,
          priceRange: 0,
          bestValue: null
        };
      }

      const prices = suppliers.map(s => s.cost_per_sqft);
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);
      const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;

      // Best value considers price, lead time, and supplier rating
      const bestValue = suppliers.reduce((best, current) => {
        const currentScore = this.calculateValueScore(current);
        const bestScore = best ? this.calculateValueScore(best) : 0;
        return currentScore > bestScore ? current : best;
      }, suppliers[0]);

      return {
        suppliers,
        lowestPrice,
        highestPrice,
        averagePrice,
        priceRange: highestPrice - lowestPrice,
        bestValue
      };
    } catch (error) {
      console.error('Error comparing prices:', error);
      throw error;
    }
  },

  // Calculate price trends
  async calculatePriceTrends(materialTypeId: string, daysBack: number = 30): Promise<PriceTrend[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      // Get current prices and supplier info
      const { data: currentPrices, error: cpError } = await supabase
        .from('material_suppliers')
        .select(`
          *,
          supplier:suppliers(id, name)
        `)
        .eq('material_type_id', materialTypeId)
        .eq('active', true);

      if (cpError) throw cpError;

      if (!currentPrices || currentPrices.length === 0) {
        return [];
      }

      const trends: PriceTrend[] = [];

      for (const ms of currentPrices) {
        // Get price history for this supplier
        const { data: history, error: histError } = await supabase
          .from('price_history')
          .select('*')
          .eq('material_supplier_id', ms.id)
          .gte('effective_date', startDate.toISOString())
          .order('effective_date', { ascending: false });

        if (histError) throw histError;

        const currentPrice = ms.cost_per_sqft;
        const previousPrice = history && history.length > 0 && history[0].old_cost_per_sqft
          ? history[0].old_cost_per_sqft
          : currentPrice;

        const changeAmount = currentPrice - previousPrice;
        const changePercentage = previousPrice !== 0
          ? (changeAmount / previousPrice) * 100
          : 0;

        let trend: 'increasing' | 'decreasing' | 'stable';
        if (Math.abs(changePercentage) < 1) {
          trend = 'stable';
        } else if (changePercentage > 0) {
          trend = 'increasing';
        } else {
          trend = 'decreasing';
        }

        trends.push({
          materialTypeId,
          supplierId: ms.supplier_id,
          currentPrice,
          previousPrice,
          changeAmount,
          changePercentage,
          trend,
          priceHistory: history || []
        });
      }

      return trends;
    } catch (error) {
      console.error('Error calculating price trends:', error);
      throw error;
    }
  },

  // Get current best price for material
  async getBestPrice(materialTypeId: string): Promise<BestPriceOption | null> {
    try {
      const { data, error } = await supabase
        .from('material_suppliers')
        .select(`
          *,
          supplier:suppliers(id, name, rating, preferred)
        `)
        .eq('material_type_id', materialTypeId)
        .eq('active', true)
        .order('cost_per_sqft', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      if (!data) return null;

      // Get last price change for this supplier
      const { data: lastChange } = await supabase
        .from('price_history')
        .select('effective_date, price_change_percentage')
        .eq('material_supplier_id', data.id)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single();

      return {
        supplierId: data.supplier_id,
        supplierName: data.supplier?.name || '',
        materialSupplierId: data.id,
        costPerSqft: data.cost_per_sqft,
        leadTimeDays: data.lead_time_days || 0,
        minimumOrderSqft: data.minimum_order_sqft || 0,
        isPreferred: data.preferred_supplier,
        lastPriceChange: lastChange ? {
          date: lastChange.effective_date,
          changePercentage: lastChange.price_change_percentage || 0
        } : undefined
      };
    } catch (error) {
      console.error('Error getting best price:', error);
      throw error;
    }
  },

  // Get all prices with significant recent changes
  async getSignificantPriceChanges(thresholdPercentage: number = 5, daysBack: number = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const { data, error } = await supabase
        .from('price_history')
        .select(`
          *,
          material_supplier:material_suppliers(
            material_type:material_types(id, name),
            supplier:suppliers(id, name)
          )
        `)
        .gte('effective_date', startDate.toISOString())
        .or(`price_change_percentage.gt.${thresholdPercentage},price_change_percentage.lt.${-thresholdPercentage}`)
        .order('effective_date', { ascending: false });

      if (error) throw error;
      return data as any[];
    } catch (error) {
      console.error('Error fetching significant price changes:', error);
      throw error;
    }
  },

  // Bulk track price changes
  async bulkTrackPriceChanges(changes: Array<{
    materialSupplierId: string;
    oldPrice?: number;
    newPrice: number;
    changeReason?: string;
    changedBy?: string;
  }>) {
    try {
      const user_id = await getCurrentUserId();
      const priceHistoryRecords = changes.map(change => ({
        user_id,
        material_supplier_id: change.materialSupplierId,
        old_cost_per_sqft: change.oldPrice,
        new_cost_per_sqft: change.newPrice,
        price_change_percentage: change.oldPrice
          ? ((change.newPrice - change.oldPrice) / change.oldPrice) * 100
          : undefined,
        change_reason: change.changeReason,
        effective_date: new Date().toISOString(),
        changed_by: change.changedBy
      }));

      const { data, error } = await supabase
        .from('price_history')
        .insert(priceHistoryRecords)
        .select();

      if (error) throw error;
      return data as PriceHistory[];
    } catch (error) {
      console.error('Error bulk tracking price changes:', error);
      throw error;
    }
  },

  // Helper to calculate value score
  calculateValueScore(supplier: MaterialSupplierWithDetails): number {
    // Lower price is better
    const priceScore = 100 / (supplier.cost_per_sqft + 1);

    // Shorter lead time is better
    const leadTimeScore = 100 / ((supplier.lead_time_days || 1) + 1);

    // Higher rating is better
    const ratingScore = (supplier.supplier?.rating || 3) * 20;

    // Preferred supplier bonus
    const preferredBonus = supplier.preferred_supplier ? 20 : 0;

    return priceScore + leadTimeScore + ratingScore + preferredBonus;
  }
};