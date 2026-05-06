import type { ReorderRuleWithDetails } from "@/src/infrastructure/models/supabase"
import { createReorderPurchaseOrder, createBulkReorderPurchaseOrder } from "@/app/actions/reorder"
import { toast } from "sonner"
import type { ReorderSuggestion } from "./reorder-suggestions"

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

    const { purchaseOrder } = await createReorderPurchaseOrder({
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
        const { purchaseOrder } = await createReorderPurchaseOrder({
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

/**
 * Bulk PO creation. The orchestration (group-by-supplier, real tax
 * calculation, multi-item PO writes, reorder-rule timestamp bumps,
 * notification fanout) lives in `CreateBulkReorderPurchaseOrderUseCase`
 * behind the `createBulkReorderPurchaseOrder` server action — this hook
 * is now just UX (selection check, toast fanout, redirect).
 */
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

    const { purchaseOrders, skipped } = await createBulkReorderPurchaseOrder({
      suggestions: selectedItems,
      reorderRules,
    })

    // Surface skipped items as warnings, grouped by reason so we don't
    // spam one toast per material when many fail the same way.
    const noSupplier = skipped.filter((s) => s.reason === "no_supplier")
    const poFailed = skipped.filter((s) => s.reason === "po_creation_failed")
    const itemFailed = skipped.filter((s) => s.reason === "item_addition_failed")

    if (noSupplier.length > 0) {
      toast.warning(`${noSupplier.length} item${noSupplier.length > 1 ? "s" : ""} skipped`, {
        description: "Some materials have no supplier configured",
      })
    }
    if (poFailed.length > 0) {
      toast.error(
        `Failed to create ${poFailed.length === 1 ? "a purchase order" : "purchase orders"}`,
        {
          description: poFailed[0].message,
        }
      )
    }
    if (itemFailed.length > 0) {
      toast.error(
        `Could not add ${itemFailed.length} item${itemFailed.length > 1 ? "s" : ""} to a purchase order`,
        { description: itemFailed[0].message }
      )
    }

    for (const po of purchaseOrders) {
      const itemCount = po.items?.length ?? 0
      const supplierName =
        selectedItems.find((s) => s.supplierId === po.supplier_id)?.supplierName ??
        "Unknown Supplier"
      toast.success(`PO ${po.po_number} created`, {
        description: `${itemCount} item${itemCount === 1 ? "" : "s"} for ${supplierName}`,
      })
    }

    if (purchaseOrders.length > 0) {
      const firstPOId = purchaseOrders[0].id

      toast.success(
        `Created ${purchaseOrders.length} purchase order${purchaseOrders.length > 1 ? "s" : ""}`,
        {
          description:
            purchaseOrders.length > 1
              ? "One PO per supplier. Redirecting..."
              : "Redirecting to Purchase Orders...",
        }
      )

      setSelectedSuggestions(new Set())
      await fetchData()

      setTimeout(() => {
        routerPush(`/dashboard/inventory/purchase-orders?view=${firstPOId}`)
      }, 2000)
    } else if (skipped.length > 0 && noSupplier.length === skipped.length) {
      // Edge case: every selected item was missing a supplier — mirror
      // the prior "No valid suppliers" hard-error toast.
      toast.error("No valid suppliers", {
        description: "None of the selected materials have suppliers configured",
      })
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
