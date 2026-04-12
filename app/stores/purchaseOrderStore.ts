import { create } from "zustand"
import {
  purchaseOrderService,
  type POReceiptResult,
} from "@/src/infrastructure/services/purchaseOrderService"
import type {
  PurchaseOrder,
  PurchaseOrderWithDetails,
  PurchaseOrderItemWithDetails,
  CreatePurchaseOrder,
  UpdatePurchaseOrder,
  CreatePurchaseOrderItem,
  UpdatePurchaseOrderItem,
  Roll,
} from "@/src/infrastructure/models/supabase"

interface POStats {
  total: number
  byStatus: Record<string, number>
  totalValue: number
  avgOrderValue: number
}

interface PurchaseOrderState {
  // Data
  purchaseOrders: PurchaseOrderWithDetails[]
  selectedPO: PurchaseOrderWithDetails | null
  pendingDeliveries: PurchaseOrderWithDetails[]
  poStats: POStats | null

  // Loading states
  isLoading: boolean
  isUpdating: boolean
  isSubmitting: boolean
  isReceiving: boolean

  // Error state
  error: string | null

  // Actions - Purchase Orders
  fetchPurchaseOrders: () => Promise<void>
  fetchPOsByStatus: (status: PurchaseOrder["status"]) => Promise<void>
  getPOById: (id: string) => Promise<PurchaseOrderWithDetails>
  createPO: (order: CreatePurchaseOrder) => Promise<PurchaseOrderWithDetails>
  updatePO: (id: string, updates: UpdatePurchaseOrder) => Promise<PurchaseOrderWithDetails>
  deletePO: (id: string) => Promise<void>
  setSelectedPO: (po: PurchaseOrderWithDetails | null) => void

  // Actions - PO Items
  addItemToPO: (item: CreatePurchaseOrderItem) => Promise<PurchaseOrderItemWithDetails>
  updatePOItem: (
    id: string,
    updates: UpdatePurchaseOrderItem
  ) => Promise<PurchaseOrderItemWithDetails>
  deletePOItem: (id: string) => Promise<void>

  // Actions - Status Management
  submitForApproval: (id: string, submittedBy?: string) => Promise<void>
  approvePO: (id: string, approvedBy?: string) => Promise<void>
  rejectPO: (id: string, rejectedBy?: string, reason?: string) => Promise<void>
  markAsOrdered: (id: string) => Promise<void>
  cancelPO: (id: string, cancelledBy?: string, reason?: string) => Promise<void>

  // Actions - Receiving
  receivePO: (
    id: string,
    items: Array<{
      itemId: string
      quantityReceived: number
      rollData?: Partial<Roll>
    }>,
    receivedBy?: string
  ) => Promise<POReceiptResult>

  // Actions - Analytics
  fetchPOStats: () => Promise<void>
  fetchPendingDeliveries: () => Promise<void>
  getSupplierPurchaseHistory: (
    supplierId: string,
    limit?: number
  ) => Promise<PurchaseOrderWithDetails[]>

  // Utility
  clearError: () => void
  reset: () => void
}

type SetState = (
  partial:
    | PurchaseOrderState
    | Partial<PurchaseOrderState>
    | ((state: PurchaseOrderState) => PurchaseOrderState | Partial<PurchaseOrderState>),
  replace?: false
) => void
type GetState = () => PurchaseOrderState

const initialState = {
  purchaseOrders: [],
  selectedPO: null,
  pendingDeliveries: [],
  poStats: null,
  isLoading: false,
  isUpdating: false,
  isSubmitting: false,
  isReceiving: false,
  error: null,
}

function createPOCrudActions(set: SetState, _get: GetState) {
  return {
    fetchPurchaseOrders: async () => {
      set({ isLoading: true, error: null })
      try {
        const orders = await purchaseOrderService.getAllPurchaseOrders()
        set({ purchaseOrders: orders, isLoading: false })
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false })
        throw error
      }
    },

    fetchPOsByStatus: async (status: PurchaseOrder["status"]) => {
      set({ isLoading: true, error: null })
      try {
        const orders = await purchaseOrderService.getPurchaseOrdersByStatus(status)
        set({ purchaseOrders: orders, isLoading: false })
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false })
        throw error
      }
    },

    getPOById: async (id: string) => {
      set({ isLoading: true, error: null })
      try {
        const po = await purchaseOrderService.getPurchaseOrderById(id)
        set({ selectedPO: po, isLoading: false })
        return po
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false })
        throw error
      }
    },

    createPO: async (order: CreatePurchaseOrder) => {
      set({ isUpdating: true, error: null })
      try {
        const newPO = await purchaseOrderService.createPurchaseOrder(order)
        set((state) => ({
          purchaseOrders: [newPO, ...state.purchaseOrders],
          selectedPO: newPO,
          isUpdating: false,
        }))
        return newPO
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },

    updatePO: async (id: string, updates: UpdatePurchaseOrder) => {
      set({ isUpdating: true, error: null })
      try {
        const updatedPO = await purchaseOrderService.updatePurchaseOrder(id, updates)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) => (po.id === id ? updatedPO : po)),
          selectedPO: state.selectedPO?.id === id ? updatedPO : state.selectedPO,
          isUpdating: false,
        }))
        return updatedPO
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },

    deletePO: async (id: string) => {
      set({ isUpdating: true, error: null })
      try {
        await purchaseOrderService.deletePurchaseOrder(id)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.filter((po) => po.id !== id),
          selectedPO: state.selectedPO?.id === id ? null : state.selectedPO,
          isUpdating: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },

    setSelectedPO: (po: PurchaseOrderWithDetails | null) => {
      set({ selectedPO: po })
    },
  }
}

function createPOItemActions(set: SetState, get: GetState) {
  return {
    addItemToPO: async (item: CreatePurchaseOrderItem) => {
      set({ isUpdating: true, error: null })
      try {
        const newItem = await purchaseOrderService.addItemToPurchaseOrder(item)

        if (get().selectedPO?.id === item.purchase_order_id) {
          const updatedPO = await purchaseOrderService.getPurchaseOrderById(item.purchase_order_id)
          set((state) => ({
            selectedPO: updatedPO,
            purchaseOrders: state.purchaseOrders.map((po) =>
              po.id === item.purchase_order_id ? updatedPO : po
            ),
            isUpdating: false,
          }))
        } else {
          set({ isUpdating: false })
        }

        return newItem
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },

    updatePOItem: async (id: string, updates: UpdatePurchaseOrderItem) => {
      set({ isUpdating: true, error: null })
      try {
        const updatedItem = await purchaseOrderService.updatePurchaseOrderItem(id, updates)

        const selectedPO = get().selectedPO
        if (selectedPO && selectedPO.items?.some((item) => item.id === id)) {
          const updatedPO = await purchaseOrderService.getPurchaseOrderById(selectedPO.id)
          set((state) => ({
            selectedPO: updatedPO,
            purchaseOrders: state.purchaseOrders.map((po) =>
              po.id === selectedPO.id ? updatedPO : po
            ),
            isUpdating: false,
          }))
        } else {
          set({ isUpdating: false })
        }

        return updatedItem
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },

    deletePOItem: async (id: string) => {
      set({ isUpdating: true, error: null })
      try {
        await purchaseOrderService.deletePurchaseOrderItem(id)

        const selectedPO = get().selectedPO
        if (selectedPO && selectedPO.items?.some((item) => item.id === id)) {
          const updatedPO = await purchaseOrderService.getPurchaseOrderById(selectedPO.id)
          set((state) => ({
            selectedPO: updatedPO,
            purchaseOrders: state.purchaseOrders.map((po) =>
              po.id === selectedPO.id ? updatedPO : po
            ),
            isUpdating: false,
          }))
        } else {
          set({ isUpdating: false })
        }
      } catch (error) {
        set({ error: (error as Error).message, isUpdating: false })
        throw error
      }
    },
  }
}

function createPOStatusActions(set: SetState, _get: GetState) {
  return {
    submitForApproval: async (id: string, submittedBy?: string) => {
      set({ isSubmitting: true, error: null })
      try {
        await purchaseOrderService.submitForApproval(id, submittedBy)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: "pending" as const } : po
          ),
          selectedPO:
            state.selectedPO?.id === id
              ? { ...state.selectedPO, status: "pending" as const }
              : state.selectedPO,
          isSubmitting: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isSubmitting: false })
        throw error
      }
    },

    approvePO: async (id: string, approvedBy?: string) => {
      set({ isSubmitting: true, error: null })
      try {
        await purchaseOrderService.approvePurchaseOrder(id, approvedBy)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: "approved" as const } : po
          ),
          selectedPO:
            state.selectedPO?.id === id
              ? { ...state.selectedPO, status: "approved" as const }
              : state.selectedPO,
          isSubmitting: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isSubmitting: false })
        throw error
      }
    },

    rejectPO: async (id: string, rejectedBy?: string, reason?: string) => {
      set({ isSubmitting: true, error: null })
      try {
        await purchaseOrderService.rejectPurchaseOrder(id, rejectedBy, reason)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: "draft" as const } : po
          ),
          selectedPO:
            state.selectedPO?.id === id
              ? { ...state.selectedPO, status: "draft" as const }
              : state.selectedPO,
          isSubmitting: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isSubmitting: false })
        throw error
      }
    },

    markAsOrdered: async (id: string) => {
      set({ isSubmitting: true, error: null })
      try {
        await purchaseOrderService.markAsOrdered(id)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: "ordered" as const } : po
          ),
          selectedPO:
            state.selectedPO?.id === id
              ? { ...state.selectedPO, status: "ordered" as const }
              : state.selectedPO,
          isSubmitting: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isSubmitting: false })
        throw error
      }
    },

    cancelPO: async (id: string, cancelledBy?: string, reason?: string) => {
      set({ isSubmitting: true, error: null })
      try {
        await purchaseOrderService.cancelPurchaseOrder(id, cancelledBy, reason)
        set((state) => ({
          purchaseOrders: state.purchaseOrders.map((po) =>
            po.id === id ? { ...po, status: "cancelled" as const } : po
          ),
          selectedPO:
            state.selectedPO?.id === id
              ? { ...state.selectedPO, status: "cancelled" as const }
              : state.selectedPO,
          isSubmitting: false,
        }))
      } catch (error) {
        set({ error: (error as Error).message, isSubmitting: false })
        throw error
      }
    },
  }
}

function createPOReceivingAndAnalyticsActions(set: SetState, _get: GetState) {
  return {
    receivePO: async (
      id: string,
      items: Array<{
        itemId: string
        quantityReceived: number
        rollData?: Partial<Roll>
      }>,
      receivedBy?: string
    ) => {
      set({ isReceiving: true, error: null })
      try {
        const result = await purchaseOrderService.receivePurchaseOrder(id, items, receivedBy)

        if (result.completedAt) {
          set((state) => ({
            purchaseOrders: state.purchaseOrders.map((po) =>
              po.id === id ? { ...po, status: "received" as const } : po
            ),
            selectedPO:
              state.selectedPO?.id === id
                ? { ...state.selectedPO, status: "received" as const }
                : state.selectedPO,
            isReceiving: false,
          }))
        } else {
          set({ isReceiving: false })
        }

        return result
      } catch (error) {
        set({ error: (error as Error).message, isReceiving: false })
        throw error
      }
    },

    fetchPOStats: async () => {
      try {
        const stats = await purchaseOrderService.getPurchaseOrderStats()
        set({ poStats: stats })
      } catch (error) {
        set({ error: (error as Error).message })
        throw error
      }
    },

    fetchPendingDeliveries: async () => {
      set({ isLoading: true, error: null })
      try {
        const deliveries = await purchaseOrderService.getPendingDeliveries()
        set({ pendingDeliveries: deliveries, isLoading: false })
      } catch (error) {
        set({ error: (error as Error).message, isLoading: false })
        throw error
      }
    },

    getSupplierPurchaseHistory: async (supplierId: string, limit = 10) => {
      try {
        const history = await purchaseOrderService.getSupplierPurchaseHistory(supplierId, limit)
        return history
      } catch (error) {
        set({ error: (error as Error).message })
        throw error
      }
    },
  }
}

export const usePurchaseOrderStore = create<PurchaseOrderState>((set, get) => ({
  ...initialState,

  ...createPOCrudActions(set, get),
  ...createPOItemActions(set, get),
  ...createPOStatusActions(set, get),
  ...createPOReceivingAndAnalyticsActions(set, get),

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set(initialState)
  },
}))
