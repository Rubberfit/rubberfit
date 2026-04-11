"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import {
  supabase,
  type PurchaseOrderWithDetails,
  type Supplier,
  type MaterialType,
} from "@/lib/supabase"

import { type TaxDetails } from "./po-tax-helpers"
import { usePOFormState } from "./use-po-form-state"
import { usePOActions } from "./use-po-actions"

interface POStats {
  total: number
  draft: number
  pending: number
  approved: number
  ordered: number
  received: number
  cancelled: number
  totalValue: number
  avgLeadTime: number
}

export function usePurchaseOrders() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderWithDetails[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPO, setSelectedPO] = useState<PurchaseOrderWithDetails | null>(null)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [supplierFilter, setSupplierFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [_dateRange, _setDateRange] = useState("30")
  const [selectedPOTaxDetails, setSelectedPOTaxDetails] = useState<TaxDetails | null>(null)

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      const { data: posData, error: posError } = await supabase
        .from("purchase_orders")
        .select(`*, supplier:suppliers(*), items:purchase_order_items(*)`)
        .order("created_at", { ascending: false })

      if (posError) throw posError
      setPurchaseOrders(posData || [])

      const { data: suppliersData, error: suppliersError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("active", true)
        .order("name")

      if (suppliersError) throw suppliersError
      setSuppliers(suppliersData || [])

      const { data: materialsData, error: materialsError } = await supabase
        .from("material_types")
        .select("*")
        .order("name")

      if (materialsError) throw materialsError
      setMaterialTypes(materialsData || [])
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Form state management
  const formState = usePOFormState(suppliers)

  // Actions
  const actions = usePOActions({
    suppliers,
    fetchData,
    setPurchaseOrders,
    setSelectedPO,
    setIsViewDialogOpen,
    setSelectedPOTaxDetails,
  })

  // URL params highlight/view
  useEffect(() => {
    const highlightPOId = searchParams.get("highlight")
    const viewPOId = searchParams.get("view")

    if ((highlightPOId || viewPOId) && purchaseOrders.length > 0) {
      const poToHighlight = purchaseOrders.find(
        (po) => po.id === highlightPOId || po.id === viewPOId
      )

      if (poToHighlight) {
        if (viewPOId) {
          setSelectedPO(poToHighlight)
          actions.fetchTaxDetailsForPO(poToHighlight)
          setIsViewDialogOpen(true)
        }

        const element = document.getElementById(`po-row-${poToHighlight.id}`)
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
          element.classList.add("bg-blue-50", "dark:bg-blue-950")
          setTimeout(() => {
            element.classList.remove("bg-blue-50", "dark:bg-blue-950")
          }, 3000)
        }
      }

      router.replace("/dashboard/inventory/purchase-orders")
    }
  }, [purchaseOrders, searchParams, router, actions])

  // Statistics
  const stats: POStats = useMemo(() => {
    const s = {
      total: purchaseOrders.length,
      draft: 0,
      pending: 0,
      approved: 0,
      ordered: 0,
      received: 0,
      cancelled: 0,
      totalValue: 0,
      avgLeadTime: 0,
    }

    let leadTimeCount = 0
    let totalLeadTime = 0

    purchaseOrders.forEach((po) => {
      s[po.status]++
      s.totalValue += po.total_amount

      if (po.actual_delivery_date && po.order_date) {
        const leadTime = Math.floor(
          (new Date(po.actual_delivery_date).getTime() - new Date(po.order_date).getTime()) /
            (1000 * 60 * 60 * 24)
        )
        totalLeadTime += leadTime
        leadTimeCount++
      }
    })

    s.avgLeadTime = leadTimeCount > 0 ? Math.round(totalLeadTime / leadTimeCount) : 0
    return s
  }, [purchaseOrders])

  // Filtered POs
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter((po) => {
      if (statusFilter !== "all" && po.status !== statusFilter) return false
      if (supplierFilter !== "all" && po.supplier_id !== supplierFilter) return false
      if (searchQuery) {
        const search = searchQuery.toLowerCase()
        return (
          po.po_number.toLowerCase().includes(search) ||
          po.supplier?.name?.toLowerCase().includes(search) ||
          po.notes?.toLowerCase().includes(search)
        )
      }
      return true
    })
  }, [purchaseOrders, statusFilter, supplierFilter, searchQuery])

  // Wrap create/update to pass form state
  const handleCreatePO = async () => {
    await actions.handleCreatePO(
      formState.formData,
      formState.setIsCreating,
      formState.setIsCreateDialogOpen,
      formState.setFormData
    )
  }

  const handleUpdatePO = async () => {
    if (!formState.editingPO) return
    await actions.handleUpdatePO(
      formState.editFormData,
      formState.editingPO,
      formState.setIsUpdating,
      formState.setIsEditDialogOpen,
      formState.setEditingPO,
      formState.setEditFormData
    )
  }

  return {
    // Data
    purchaseOrders,
    suppliers,
    materialTypes,
    loading,
    stats,
    filteredPOs,

    // View dialog
    selectedPO,
    setSelectedPO,
    isViewDialogOpen,
    setIsViewDialogOpen,
    selectedPOTaxDetails,
    fetchTaxDetailsForPO: actions.fetchTaxDetailsForPO,

    // Create dialog
    isCreateDialogOpen: formState.isCreateDialogOpen,
    setIsCreateDialogOpen: formState.setIsCreateDialogOpen,
    formData: formState.formData,
    setFormData: formState.setFormData,
    isCreating: formState.isCreating,
    createFormTaxDetails: formState.createFormTaxDetails,
    handleCreatePO,

    // Edit dialog
    isEditDialogOpen: formState.isEditDialogOpen,
    setIsEditDialogOpen: formState.setIsEditDialogOpen,
    editingPO: formState.editingPO,
    setEditingPO: formState.setEditingPO,
    editFormData: formState.editFormData,
    setEditFormData: formState.setEditFormData,
    isUpdating: formState.isUpdating,
    editFormTaxDetails: formState.editFormTaxDetails,
    handleUpdatePO,
    handleEditPO: formState.handleEditPO,

    // Shared
    updatePOStatus: actions.updatePOStatus,
    fetchData,
    confirmAction: actions.confirmAction,
    setConfirmAction: actions.setConfirmAction,
    handleConfirmRemoveItem: actions.handleConfirmRemoveItem,

    // Filters
    statusFilter,
    setStatusFilter,
    supplierFilter,
    setSupplierFilter,
    searchQuery,
    setSearchQuery,
  }
}
