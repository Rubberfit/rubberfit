"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import type {
  PurchaseOrderWithDetails,
  Supplier,
  MaterialType,
} from "@/src/infrastructure/models/supabase"
import { legacyPurchaseOrderService as purchaseOrderService } from "@/src/infrastructure/services/legacyPurchaseOrderService"
import { legacySupplierService as supplierService } from "@/src/infrastructure/services/legacySupplierService"
import { materialTypeRepository } from "@/src/infrastructure/repositories/material-types.repository"

import { type TaxDetails } from "./po-tax-helpers"
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

      const [posData, suppliersData, materialsData] = await Promise.all([
        purchaseOrderService.getAllPurchaseOrders(),
        supplierService.getActiveSuppliers(),
        materialTypeRepository.getAll(),
      ])

      setPurchaseOrders(posData)
      setSuppliers(suppliersData)
      setMaterialTypes(materialsData)
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Actions
  const actions = usePOActions({
    purchaseOrders,
    setPurchaseOrders,
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

  return {
    // Data
    purchaseOrders,
    suppliers,
    materialTypes,
    loading,
    stats,
    filteredPOs,

    // View drawer (read-only PO inspection)
    selectedPO,
    setSelectedPO,
    isViewDialogOpen,
    setIsViewDialogOpen,
    selectedPOTaxDetails,
    fetchTaxDetailsForPO: actions.fetchTaxDetailsForPO,

    // Shared
    updatePOStatus: actions.updatePOStatus,
    fetchData,
    confirmAction: actions.confirmAction,
    setConfirmAction: actions.setConfirmAction,

    // Filters
    statusFilter,
    setStatusFilter,
    supplierFilter,
    setSupplierFilter,
    searchQuery,
    setSearchQuery,
  }
}
