import { create } from "zustand"
import {
  reorderService,
  type ReorderSuggestion,
  type OptimalOrderQuantity,
} from "@/src/infrastructure/services/reorderService"
import type {
  ReorderRuleWithDetails,
  CreateReorderRule,
  UpdateReorderRule,
} from "@/src/entities"

interface ReorderState {
  // Data
  reorderRules: ReorderRuleWithDetails[]
  activeRules: ReorderRuleWithDetails[]
  selectedRule: ReorderRuleWithDetails | null
  suggestions: ReorderSuggestion[]

  // Loading states
  isLoading: boolean
  isUpdating: boolean
  isCheckingReorders: boolean
  isGeneratingPO: boolean

  // Error state
  error: string | null

  // Actions - Reorder Rules
  fetchReorderRules: () => Promise<void>
  fetchActiveRules: () => Promise<void>
  getRuleById: (id: string) => Promise<ReorderRuleWithDetails>
  getRuleByMaterial: (materialTypeId: string) => Promise<ReorderRuleWithDetails | null>
  createRule: (rule: CreateReorderRule) => Promise<ReorderRuleWithDetails>
  updateRule: (id: string, updates: UpdateReorderRule) => Promise<ReorderRuleWithDetails>
  deleteRule: (id: string) => Promise<void>
  toggleRuleActive: (id: string, active: boolean) => Promise<void>
  toggleAutoReorder: (id: string, autoReorder: boolean) => Promise<void>
  setSelectedRule: (rule: ReorderRuleWithDetails | null) => void

  // Actions - Reorder Suggestions
  checkReorderPoints: () => Promise<void>
  generateSuggestions: (includeInactive?: boolean) => Promise<void>
  createPurchaseOrderFromSuggestion: (suggestion: ReorderSuggestion) => Promise<unknown>
  calculateOptimalQuantity: (
    materialTypeId: string,
    supplierId?: string
  ) => Promise<OptimalOrderQuantity>
  clearSuggestions: () => void

  // Bulk operations
  bulkUpdateRules: (updates: Array<{ id: string; updates: UpdateReorderRule }>) => Promise<void>

  // Utility
  clearError: () => void
  reset: () => void
}

const initialState = {
  reorderRules: [],
  activeRules: [],
  selectedRule: null,
  suggestions: [],
  isLoading: false,
  isUpdating: false,
  isCheckingReorders: false,
  isGeneratingPO: false,
  error: null,
}

export const useReorderStore = create<ReorderState>((set, _get) => ({
  ...initialState,

  // Fetch all reorder rules
  fetchReorderRules: async () => {
    set({ isLoading: true, error: null })
    try {
      const rules = await reorderService.getAllReorderRules()
      set({ reorderRules: rules, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  // Fetch active rules only
  fetchActiveRules: async () => {
    set({ isLoading: true, error: null })
    try {
      const rules = await reorderService.getActiveReorderRules()
      set({ activeRules: rules, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  // Get rule by ID
  getRuleById: async (id: string) => {
    set({ isLoading: true, error: null })
    try {
      const rule = await reorderService.getReorderRuleById(id)
      set({ selectedRule: rule, isLoading: false })
      return rule
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
      throw error
    }
  },

  // Get rule by material
  getRuleByMaterial: async (materialTypeId: string) => {
    try {
      const rule = await reorderService.getReorderRuleByMaterial(materialTypeId)
      return rule
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  // Create new reorder rule
  createRule: async (rule: CreateReorderRule) => {
    set({ isUpdating: true, error: null })
    try {
      const newRule = await reorderService.createReorderRule(rule)
      set((state) => ({
        reorderRules: [...state.reorderRules, newRule],
        activeRules: newRule.active ? [...state.activeRules, newRule] : state.activeRules,
        isUpdating: false,
      }))
      return newRule
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Update reorder rule
  updateRule: async (id: string, updates: UpdateReorderRule) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedRule = await reorderService.updateReorderRule(id, updates)
      set((state) => ({
        reorderRules: state.reorderRules.map((r) => (r.id === id ? updatedRule : r)),
        activeRules: state.activeRules
          .map((r) => (r.id === id ? updatedRule : r))
          .filter((r) => r.active),
        selectedRule: state.selectedRule?.id === id ? updatedRule : state.selectedRule,
        isUpdating: false,
      }))
      return updatedRule
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Delete reorder rule
  deleteRule: async (id: string) => {
    set({ isUpdating: true, error: null })
    try {
      await reorderService.deleteReorderRule(id)
      set((state) => ({
        reorderRules: state.reorderRules.filter((r) => r.id !== id),
        activeRules: state.activeRules.filter((r) => r.id !== id),
        selectedRule: state.selectedRule?.id === id ? null : state.selectedRule,
        isUpdating: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Toggle rule active status
  toggleRuleActive: async (id: string, active: boolean) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedRule = await reorderService.updateReorderRule(id, { active })
      set((state) => ({
        reorderRules: state.reorderRules.map((r) => (r.id === id ? updatedRule : r)),
        activeRules: active
          ? [...state.activeRules.filter((r) => r.id !== id), updatedRule]
          : state.activeRules.filter((r) => r.id !== id),
        selectedRule: state.selectedRule?.id === id ? updatedRule : state.selectedRule,
        isUpdating: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Toggle auto-reorder
  toggleAutoReorder: async (id: string, autoReorder: boolean) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedRule = await reorderService.updateReorderRule(id, { auto_reorder: autoReorder })
      set((state) => ({
        reorderRules: state.reorderRules.map((r) => (r.id === id ? updatedRule : r)),
        activeRules: state.activeRules.map((r) => (r.id === id ? updatedRule : r)),
        selectedRule: state.selectedRule?.id === id ? updatedRule : state.selectedRule,
        isUpdating: false,
      }))
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Set selected rule
  setSelectedRule: (rule: ReorderRuleWithDetails | null) => {
    set({ selectedRule: rule })
  },

  // Check reorder points
  checkReorderPoints: async () => {
    set({ isCheckingReorders: true, error: null })
    try {
      const suggestions = await reorderService.checkReorderPoints()
      set({ suggestions, isCheckingReorders: false })
    } catch (error) {
      set({ error: (error as Error).message, isCheckingReorders: false })
      throw error
    }
  },

  // Generate suggestions
  generateSuggestions: async (includeInactive = false) => {
    set({ isCheckingReorders: true, error: null })
    try {
      const suggestions = await reorderService.generateReorderSuggestions(includeInactive)
      set({ suggestions, isCheckingReorders: false })
    } catch (error) {
      set({ error: (error as Error).message, isCheckingReorders: false })
      throw error
    }
  },

  // Create purchase order from suggestion
  createPurchaseOrderFromSuggestion: async (suggestion: ReorderSuggestion) => {
    set({ isGeneratingPO: true, error: null })
    try {
      const po = await reorderService.createAutomaticPurchaseOrder(suggestion)

      // Remove suggestion from list after PO creation
      set((state) => ({
        suggestions: state.suggestions.filter(
          (s) => s.materialTypeId !== suggestion.materialTypeId
        ),
        isGeneratingPO: false,
      }))

      return po
    } catch (error) {
      set({ error: (error as Error).message, isGeneratingPO: false })
      throw error
    }
  },

  // Calculate optimal order quantity
  calculateOptimalQuantity: async (materialTypeId: string, supplierId?: string) => {
    try {
      const optimal = await reorderService.calculateOptimalOrderQuantity(materialTypeId, supplierId)
      return optimal
    } catch (error) {
      set({ error: (error as Error).message })
      throw error
    }
  },

  // Clear suggestions
  clearSuggestions: () => {
    set({ suggestions: [] })
  },

  // Bulk update rules
  bulkUpdateRules: async (updates: Array<{ id: string; updates: UpdateReorderRule }>) => {
    set({ isUpdating: true, error: null })
    try {
      const updatedRules = await reorderService.bulkUpdateReorderRules(updates)

      // Update state with all changed rules
      set((state) => {
        const updatedIds = new Set(updatedRules.map((r) => r.id))
        const unchangedRules = state.reorderRules.filter((r) => !updatedIds.has(r.id))
        const newRules = [...unchangedRules, ...updatedRules]
        const newActiveRules = newRules.filter((r) => r.active)

        return {
          reorderRules: newRules,
          activeRules: newActiveRules,
          isUpdating: false,
        }
      })
    } catch (error) {
      set({ error: (error as Error).message, isUpdating: false })
      throw error
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },

  // Reset store
  reset: () => {
    set(initialState)
  },
}))
