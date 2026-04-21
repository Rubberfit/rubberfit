import type { ReorderRuleWithDetails } from "@/src/entities"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import type { ICreateReorderPurchaseOrderUseCase } from "@/src/application/use-cases/reorder/create-reorder-purchase-order.use-case"
import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { toast } from "sonner"
import type { ReorderSuggestion } from "./reorder-suggestions"

function buildSupplierAddress(s: {
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null
}): string {
  const parts = [s.address, s.city, s.state, s.zip_code, s.country].filter(Boolean)
  return parts.join(", ")
}

async function buildPOSupplierFields(supplierId: string) {
  try {
    const supplier = await supplierService.getSupplierById(supplierId)
    if (!supplier) return { order_date: new Date().toISOString() }

    const address = buildSupplierAddress(supplier)
    return {
      order_date: new Date().toISOString(),
      payment_terms: supplier.payment_terms || undefined,
      shipping_address: address || undefined,
      billing_address: address || undefined,
    }
  } catch (_error) {
    return { order_date: new Date().toISOString() }
  }
}

export interface HandleCreatePOCallbacks {
  setCreatingPOFor: (id: string | null) => void
  fetchData: () => Promise<void>
  routerPush: (url: string) => void
  reorderRules: ReorderRuleWithDetails[]
}

export async function handleCreatePO(
  suggestion: ReorderSuggestion,
  callbacks: HandleCreatePOCallbacks
) {
  const { setCreatingPOFor, fetchData, routerPush, reorderRules } = callbacks
  try {
    setCreatingPOFor(suggestion.materialTypeId)

    if (!suggestion.supplierId) {
      toast.error("No supplier configured", {
        description: "Please configure a supplier for this material in the reorder rules.",
      })
      return
    }

    const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
      TOKENS.ICreateReorderPurchaseOrderUseCase
    )
    const { purchaseOrder } = await useCase.execute({
      suggestion,
      reorderRules,
    })

    toast.success("Purchase order created", {
      description: `PO ${purchaseOrder.po_number} created for ${suggestion.materialName}. Redirecting...`,
    })

    await fetchData()

    setTimeout(() => {
      routerPush(`/dashboard/inventory/purchase-orders?view=${purchaseOrder.id}`)
    }, 1500)
  } catch (error) {
    console.error("Error creating PO:", error)
    toast.error("Failed to create purchase order", {
      description: error instanceof Error ? error.message : "An unexpected error occurred",
    })
  } finally {
    setCreatingPOFor(null)
  }
}

export interface HandleCreateIndividualPOsCallbacks {
  setCreatingIndividualPOs: (value: boolean) => void
  setSelectedSuggestions: (value: Set<string>) => void
  fetchData: () => Promise<void>
  routerPush: (url: string) => void
  reorderRules: ReorderRuleWithDetails[]
  suggestions: ReorderSuggestion[]
  selectedSuggestions: Set<string>
}

export async function handleCreateIndividualPOs(callbacks: HandleCreateIndividualPOsCallbacks) {
  const {
    setCreatingIndividualPOs,
    setSelectedSuggestions,
    fetchData,
    routerPush,
    reorderRules,
    suggestions,
    selectedSuggestions,
  } = callbacks
  try {
    setCreatingIndividualPOs(true)

    const selectedItems = suggestions.filter((s) => selectedSuggestions.has(s.materialTypeId))

    if (selectedItems.length === 0) {
      toast.error("No items selected", {
        description: "Please select at least one material to create purchase orders.",
      })
      return
    }

    let successCount = 0
    let failCount = 0
    let firstPOId: string | null = null

    for (const suggestion of selectedItems) {
      if (!suggestion.supplierId) {
        failCount++
        toast.error(`No supplier for ${suggestion.materialName}`, {
          description: "Skipping this material - no supplier configured",
        })
        continue
      }

      try {
        const useCase = resolveUseCase<ICreateReorderPurchaseOrderUseCase>(
          TOKENS.ICreateReorderPurchaseOrderUseCase
        )
        const { purchaseOrder } = await useCase.execute({
          suggestion,
          reorderRules,
        })

        if (!firstPOId) firstPOId = purchaseOrder.id
        successCount++
      } catch (error) {
        failCount++
        console.error(`Error creating PO for ${suggestion.materialName}:`, error)
      }
    }

    if (successCount > 0) {
      toast.success(`Created ${successCount} purchase order${successCount > 1 ? "s" : ""}`, {
        description:
          failCount > 0
            ? `${failCount} failed - check supplier configuration. Redirecting...`
            : "Redirecting to Purchase Orders...",
      })

      setSelectedSuggestions(new Set())
      await fetchData()

      setTimeout(() => {
        if (firstPOId) {
          routerPush(`/dashboard/inventory/purchase-orders?view=${firstPOId}`)
        } else {
          routerPush("/dashboard/inventory/purchase-orders")
        }
      }, 2000)
    } else {
      toast.error("Failed to create purchase orders", {
        description: "Check supplier configuration for selected materials",
      })
    }
  } catch (error) {
    console.error("Error creating individual POs:", error)
    toast.error("Failed to create purchase orders", {
      description: error instanceof Error ? error.message : "An unexpected error occurred",
    })
  } finally {
    setCreatingIndividualPOs(false)
  }
}

export interface HandleCreateBulkPOCallbacks {
  setCreatingBulkPO: (value: boolean) => void
  setSelectedSuggestions: (value: Set<string>) => void
  fetchData: () => Promise<void>
  routerPush: (url: string) => void
  reorderRules: ReorderRuleWithDetails[]
  suggestions: ReorderSuggestion[]
  selectedSuggestions: Set<string>
}

// Bulk path groups by supplier into a single PO per supplier — out of scope for
// CreateReorderPurchaseOrderUseCase (which emits one PO per suggestion). Stays
// service-level for now.
export async function handleCreateBulkPO(callbacks: HandleCreateBulkPOCallbacks) {
  const {
    setCreatingBulkPO,
    setSelectedSuggestions,
    fetchData,
    routerPush,
    reorderRules,
    suggestions,
    selectedSuggestions,
  } = callbacks
  try {
    setCreatingBulkPO(true)

    const selectedItems = suggestions.filter((s) => selectedSuggestions.has(s.materialTypeId))

    if (selectedItems.length === 0) {
      toast.error("No items selected", {
        description: "Please select at least one material to create a bulk purchase order.",
      })
      return
    }

    const supplierGroups = new Map<string, ReorderSuggestion[]>()
    const noSupplierItems: ReorderSuggestion[] = []

    selectedItems.forEach((item) => {
      if (item.supplierId) {
        const existing = supplierGroups.get(item.supplierId) || []
        existing.push(item)
        supplierGroups.set(item.supplierId, existing)
      } else {
        noSupplierItems.push(item)
      }
    })

    if (noSupplierItems.length > 0) {
      toast.warning(
        `${noSupplierItems.length} item${noSupplierItems.length > 1 ? "s" : ""} skipped`,
        {
          description: "Some materials have no supplier configured",
        }
      )
    }

    if (supplierGroups.size === 0) {
      toast.error("No valid suppliers", {
        description: "None of the selected materials have suppliers configured",
      })
      return
    }

    let poCount = 0
    let firstPOId: string | null = null

    for (const [supplierId, items] of supplierGroups) {
      try {
        const totalCost = items.reduce((sum, item) => sum + item.estimatedCost, 0)
        const supplierName = items[0].supplierName || "Unknown Supplier"

        const supplierFields = await buildPOSupplierFields(supplierId)

        const po = await purchaseOrderService.createPurchaseOrder({
          supplier_id: supplierId,
          status: "draft",
          ...supplierFields,
          requested_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          notes: `Bulk reorder for ${items.length} material${items.length > 1 ? "s" : ""}`,
          subtotal: totalCost,
          tax_amount: totalCost * 0.08,
          shipping_cost: 0,
          total_amount: totalCost * 1.08,
          auto_generated: false,
        })

        if (!po) throw new Error("Failed to create purchase order")

        for (const item of items) {
          await purchaseOrderService.addItemToPurchaseOrder({
            purchase_order_id: po.id,
            material_type_id: item.materialTypeId,
            description: item.materialName,
            quantity_sqft: item.suggestedQuantity,
            unit_cost: item.estimatedCost / item.suggestedQuantity,
            width: 60,
            thickness: 0.125,
          })

          const rule = reorderRules.find((r) => r.material_type_id === item.materialTypeId)
          if (rule) {
            await reorderService.updateReorderRule(rule.id, {
              last_triggered_at: new Date().toISOString(),
            })
          }
        }

        if (!firstPOId) firstPOId = po.id

        poCount++
        toast.success(`PO ${po.po_number} created`, {
          description: `${items.length} item${items.length > 1 ? "s" : ""} for ${supplierName}`,
        })
      } catch (error) {
        console.error(`Error creating bulk PO for supplier ${supplierId}:`, error)
        toast.error("Failed to create purchase order", {
          description: `Error creating PO for supplier ${items[0].supplierName}`,
        })
      }
    }

    if (poCount > 0) {
      toast.success(`Created ${poCount} purchase order${poCount > 1 ? "s" : ""}`, {
        description:
          supplierGroups.size > 1
            ? "One PO per supplier. Redirecting..."
            : "Redirecting to Purchase Orders...",
      })

      setSelectedSuggestions(new Set())
      await fetchData()

      setTimeout(() => {
        if (firstPOId) {
          routerPush(`/dashboard/inventory/purchase-orders?view=${firstPOId}`)
        } else {
          routerPush("/dashboard/inventory/purchase-orders")
        }
      }, 2000)
    }
  } catch (error) {
    console.error("Error creating bulk PO:", error)
    toast.error("Failed to create bulk purchase order", {
      description: error instanceof Error ? error.message : "An unexpected error occurred",
    })
  } finally {
    setCreatingBulkPO(false)
  }
}
