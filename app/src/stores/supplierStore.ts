import { create } from 'zustand';
import { supplierService } from '@/services/supplierService';
import { priceHistoryService } from '@/services/priceHistoryService';
import type {
  Supplier,
  MaterialSupplier,
  MaterialSupplierWithDetails,
  CreateSupplier,
  UpdateSupplier,
  CreateMaterialSupplier,
  UpdateMaterialSupplier
} from '@/lib/supabase';

interface SupplierState {
  // Data
  suppliers: Supplier[];
  activeSuppliers: Supplier[];
  preferredSuppliers: Supplier[];
  materialSuppliers: MaterialSupplierWithDetails[];
  selectedSupplier: Supplier | null;

  // Loading states
  isLoading: boolean;
  isUpdating: boolean;

  // Error state
  error: string | null;

  // Actions - Suppliers
  fetchSuppliers: () => Promise<void>;
  fetchActiveSuppliers: () => Promise<void>;
  fetchPreferredSuppliers: () => Promise<void>;
  getSupplierById: (id: string) => Promise<Supplier>;
  createSupplier: (supplier: CreateSupplier) => Promise<Supplier>;
  updateSupplier: (id: string, updates: UpdateSupplier) => Promise<Supplier>;
  deleteSupplier: (id: string) => Promise<void>;
  updateSupplierRating: (id: string, rating: number) => Promise<void>;
  setSelectedSupplier: (supplier: Supplier | null) => void;
  searchSuppliers: (query: string) => Promise<Supplier[]>;

  // Actions - Material-Supplier Relationships
  linkMaterialToSupplier: (materialSupplier: CreateMaterialSupplier) => Promise<MaterialSupplierWithDetails>;
  unlinkMaterialFromSupplier: (materialSupplierId: string) => Promise<void>;
  updateMaterialSupplier: (id: string, updates: UpdateMaterialSupplier) => Promise<MaterialSupplierWithDetails>;
  getSuppliersByMaterialType: (materialTypeId: string) => Promise<MaterialSupplierWithDetails[]>;
  getMaterialsBySupplier: (supplierId: string) => Promise<MaterialSupplierWithDetails[]>;
  getPreferredSupplierForMaterial: (materialTypeId: string) => Promise<MaterialSupplierWithDetails | null>;
  setPreferredSupplier: (materialTypeId: string, supplierId: string) => Promise<MaterialSupplierWithDetails>;

  // Actions - Price Management
  updateMaterialPrice: (
    materialSupplierId: string,
    newPrice: number,
    reason?: string,
    changedBy?: string
  ) => Promise<void>;

  // Bulk operations
  bulkCreateSuppliers: (suppliers: CreateSupplier[]) => Promise<void>;
  bulkLinkMaterialsToSupplier: (materialSuppliers: CreateMaterialSupplier[]) => Promise<void>;

  // Utility
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  suppliers: [],
  activeSuppliers: [],
  preferredSuppliers: [],
  materialSuppliers: [],
  selectedSupplier: null,
  isLoading: false,
  isUpdating: false,
  error: null
};

export const useSupplierStore = create<SupplierState>((set, get) => ({
  ...initialState,

  // Fetch all suppliers
  fetchSuppliers: async () => {
    set({ isLoading: true, error: null });
    try {
      const suppliers = await supplierService.getAllSuppliers();
      set({ suppliers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Fetch active suppliers
  fetchActiveSuppliers: async () => {
    set({ isLoading: true, error: null });
    try {
      const activeSuppliers = await supplierService.getActiveSuppliers();
      set({ activeSuppliers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Fetch preferred suppliers
  fetchPreferredSuppliers: async () => {
    set({ isLoading: true, error: null });
    try {
      const preferredSuppliers = await supplierService.getPreferredSuppliers();
      set({ preferredSuppliers, isLoading: false });
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Get supplier by ID
  getSupplierById: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const supplier = await supplierService.getSupplierById(id);
      set({ selectedSupplier: supplier, isLoading: false });
      return supplier;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  // Create new supplier
  createSupplier: async (supplier: CreateSupplier) => {
    set({ isUpdating: true, error: null });
    try {
      const newSupplier = await supplierService.createSupplier(supplier);
      set(state => ({
        suppliers: [...state.suppliers, newSupplier],
        isUpdating: false
      }));
      return newSupplier;
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Update supplier
  updateSupplier: async (id: string, updates: UpdateSupplier) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedSupplier = await supplierService.updateSupplier(id, updates);
      set(state => ({
        suppliers: state.suppliers.map(s => s.id === id ? updatedSupplier : s),
        activeSuppliers: state.activeSuppliers.map(s => s.id === id ? updatedSupplier : s),
        preferredSuppliers: state.preferredSuppliers.map(s => s.id === id ? updatedSupplier : s),
        selectedSupplier: state.selectedSupplier?.id === id ? updatedSupplier : state.selectedSupplier,
        isUpdating: false
      }));
      return updatedSupplier;
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Delete supplier
  deleteSupplier: async (id: string) => {
    set({ isUpdating: true, error: null });
    try {
      await supplierService.deleteSupplier(id);
      set(state => ({
        suppliers: state.suppliers.filter(s => s.id !== id),
        activeSuppliers: state.activeSuppliers.filter(s => s.id !== id),
        preferredSuppliers: state.preferredSuppliers.filter(s => s.id !== id),
        selectedSupplier: state.selectedSupplier?.id === id ? null : state.selectedSupplier,
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Update supplier rating
  updateSupplierRating: async (id: string, rating: number) => {
    set({ isUpdating: true, error: null });
    try {
      const updatedSupplier = await supplierService.updateSupplierRating(id, rating);
      set(state => ({
        suppliers: state.suppliers.map(s => s.id === id ? updatedSupplier : s),
        activeSuppliers: state.activeSuppliers.map(s => s.id === id ? updatedSupplier : s),
        preferredSuppliers: state.preferredSuppliers.map(s => s.id === id ? updatedSupplier : s),
        selectedSupplier: state.selectedSupplier?.id === id ? updatedSupplier : state.selectedSupplier,
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Set selected supplier
  setSelectedSupplier: (supplier: Supplier | null) => {
    set({ selectedSupplier: supplier });
  },

  // Search suppliers
  searchSuppliers: async (query: string) => {
    try {
      const results = await supplierService.searchSuppliers(query);
      return results;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // Link material to supplier
  linkMaterialToSupplier: async (materialSupplier: CreateMaterialSupplier) => {
    set({ isUpdating: true, error: null });
    try {
      const linked = await supplierService.linkMaterialToSupplier(materialSupplier);
      set(state => ({
        materialSuppliers: [...state.materialSuppliers, linked],
        isUpdating: false
      }));
      return linked;
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Unlink material from supplier
  unlinkMaterialFromSupplier: async (materialSupplierId: string) => {
    set({ isUpdating: true, error: null });
    try {
      await supplierService.unlinkMaterialFromSupplier(materialSupplierId);
      set(state => ({
        materialSuppliers: state.materialSuppliers.filter(ms => ms.id !== materialSupplierId),
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Update material supplier relationship
  updateMaterialSupplier: async (id: string, updates: UpdateMaterialSupplier) => {
    set({ isUpdating: true, error: null });
    try {
      const updated = await supplierService.updateMaterialSupplier(id, updates);
      set(state => ({
        materialSuppliers: state.materialSuppliers.map(ms => ms.id === id ? updated : ms),
        isUpdating: false
      }));
      return updated;
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Get suppliers by material type
  getSuppliersByMaterialType: async (materialTypeId: string) => {
    try {
      const suppliers = await supplierService.getSuppliersByMaterialType(materialTypeId);
      return suppliers;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // Get materials by supplier
  getMaterialsBySupplier: async (supplierId: string) => {
    try {
      const materials = await supplierService.getMaterialsBySupplier(supplierId);
      return materials;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // Get preferred supplier for material
  getPreferredSupplierForMaterial: async (materialTypeId: string) => {
    try {
      const preferred = await supplierService.getPreferredSupplierForMaterial(materialTypeId);
      return preferred;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  // Set preferred supplier for material
  setPreferredSupplier: async (materialTypeId: string, supplierId: string) => {
    set({ isUpdating: true, error: null });
    try {
      const updated = await supplierService.setPreferredSupplier(materialTypeId, supplierId);
      set(state => ({
        materialSuppliers: state.materialSuppliers.map(ms =>
          ms.material_type_id === materialTypeId
            ? { ...ms, preferred_supplier: ms.supplier_id === supplierId }
            : ms
        ),
        isUpdating: false
      }));
      return updated;
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Update material price with history tracking
  updateMaterialPrice: async (
    materialSupplierId: string,
    newPrice: number,
    reason?: string,
    changedBy?: string
  ) => {
    set({ isUpdating: true, error: null });
    try {
      // Get current price
      const currentMS = get().materialSuppliers.find(ms => ms.id === materialSupplierId);
      const oldPrice = currentMS?.cost_per_sqft;

      // Track price change
      await priceHistoryService.trackPriceChange(
        materialSupplierId,
        oldPrice,
        newPrice,
        reason,
        changedBy
      );

      // Update the material supplier price
      const updated = await supplierService.updateMaterialSupplier(materialSupplierId, {
        cost_per_sqft: newPrice,
        effective_date: new Date().toISOString()
      });

      set(state => ({
        materialSuppliers: state.materialSuppliers.map(ms => ms.id === materialSupplierId ? updated : ms),
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Bulk create suppliers
  bulkCreateSuppliers: async (suppliers: CreateSupplier[]) => {
    set({ isUpdating: true, error: null });
    try {
      const newSuppliers = await supplierService.bulkCreateSuppliers(suppliers);
      set(state => ({
        suppliers: [...state.suppliers, ...newSuppliers],
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Bulk link materials to supplier
  bulkLinkMaterialsToSupplier: async (materialSuppliers: CreateMaterialSupplier[]) => {
    set({ isUpdating: true, error: null });
    try {
      const linked = await supplierService.bulkLinkMaterialsToSupplier(materialSuppliers);
      set(state => ({
        materialSuppliers: [...state.materialSuppliers, ...linked],
        isUpdating: false
      }));
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Reset store
  reset: () => {
    set(initialState);
  }
}));