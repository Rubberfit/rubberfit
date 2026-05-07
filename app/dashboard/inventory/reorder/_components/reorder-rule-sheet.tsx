"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, X } from "lucide-react"
import { toast } from "sonner"

import {
  type CreateReorderRule,
  type MaterialType,
  type ReorderRule,
  type Supplier,
  type UpdateReorderRule,
} from "@/src/infrastructure/models/supabase"
import { reorderRules as reorderRulesSdk } from "@/src/infrastructure/api-client/rf/procurement"
import { Button } from "@/app/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"

import { ReorderRuleFormFields } from "./reorder-rule-form-fields"

interface ReorderRuleSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: ReorderRule | null
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  onSuccess?: () => void
}

const DEFAULT_FORM_DATA = {
  material_type_id: "",
  supplier_id: "",
  reorder_point: 100,
  reorder_quantity: 500,
  max_stock_level: 1000,
  lead_time_days: 7,
  safety_stock_days: 3,
  auto_reorder: false,
  active: true,
  notes: "",
}

const DEFAULT_EOQ_DATA = {
  annualDemand: 10000,
  orderingCost: 50,
  holdingCost: 5,
  calculatedEOQ: 0,
}

/**
 * Reorder rule editor — Phase 3 PR 3f.
 *
 * Right-docked `<Sheet>` replacement for the previous centered
 * `ReorderRuleModal`. Header/footer chrome and width
 * (`sm:max-w-2xl`) match `PoEditDrawerBody` (PR 3e ARC-206) so all
 * inventory edit surfaces share one drawer pattern. Form sections
 * (`ReorderRuleFormFields`) are unchanged — this PR is a chrome
 * swap, not a form redesign.
 */
export function ReorderRuleSheet({
  open,
  onOpenChange,
  rule,
  materialTypes,
  suppliers,
  onSuccess,
}: ReorderRuleSheetProps) {
  const [loading, setLoading] = useState(false)
  // useRef-based re-entry guard — `loading` setter is async, so a
  // double-click can fire two submits before the disabled state
  // lands. Same pattern as PoEditDrawerBody (PR #194 round-3).
  const isSavingRef = useRef(false)
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA)
  const [eoqData, setEoqData] = useState(DEFAULT_EOQ_DATA)

  useEffect(() => {
    if (rule) {
      setFormData({
        material_type_id: rule.material_type_id,
        supplier_id: rule.supplier_id || "",
        reorder_point: rule.reorder_point,
        reorder_quantity: rule.reorder_quantity,
        max_stock_level: rule.max_stock_level || 1000,
        lead_time_days: rule.lead_time_days,
        safety_stock_days: rule.safety_stock_days,
        auto_reorder: rule.auto_reorder,
        active: rule.active,
        notes: rule.notes || "",
      })
    } else {
      setFormData(DEFAULT_FORM_DATA)
    }
  }, [rule])

  const calculateEOQ = () => {
    const { annualDemand, orderingCost, holdingCost } = eoqData
    if (annualDemand > 0 && orderingCost > 0 && holdingCost > 0) {
      const eoq = Math.round(Math.sqrt((2 * annualDemand * orderingCost) / holdingCost))
      // Functional updaters — `eoqData` / `formData` snapshots can
      // be stale if the parent re-renders mid-EOQ click (form
      // fields fire onChange synchronously when the user finishes
      // typing the holding cost and tabs straight to Calculate).
      setEoqData((prev) => ({ ...prev, calculatedEOQ: eoq }))
      setFormData((prev) => ({ ...prev, reorder_quantity: eoq }))
      toast.success(`EOQ calculated: ${eoq} sq ft`)
    } else {
      toast.error("Please enter valid values for EOQ calculation")
    }
  }

  const calculateReorderPoint = () => {
    // Compute the new value from the click-time snapshot (the value
    // the user sees when pressing Calculate is what they expect to
    // become the reorder point). The functional updater below
    // merges into the latest `prev` to avoid clobbering, but the
    // toast must fire OUTSIDE the updater — Strict Mode invokes
    // setState callbacks twice in dev to detect impurity, so a
    // toast inside would double-fire.
    const dailyUsage = eoqData.annualDemand / 365
    const leadTimeUsage = dailyUsage * formData.lead_time_days
    const safetyStock = dailyUsage * formData.safety_stock_days
    const reorderPoint = Math.round(leadTimeUsage + safetyStock)
    setFormData((prev) => ({ ...prev, reorder_point: reorderPoint }))
    toast.success(`Reorder point calculated: ${reorderPoint} sq ft`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSavingRef.current) return
    isSavingRef.current = true
    setLoading(true)

    try {
      if (!formData.material_type_id) {
        throw new Error("Please select a material type")
      }

      if (formData.max_stock_level != null && formData.max_stock_level > 0) {
        if (formData.max_stock_level < formData.reorder_quantity) {
          throw new Error("Max stock level must be greater than or equal to reorder quantity")
        }
        if (formData.max_stock_level <= formData.reorder_point) {
          throw new Error("Max stock level must be greater than reorder point")
        }
      }

      if (rule) {
        const { material_type_id: _material_type_id, supplier_id, ...rest } = formData
        const updateData = {
          ...rest,
          supplier_id: supplier_id || null,
        } as UpdateReorderRule

        const response = await reorderRulesSdk.update(
          rule.id,
          updateData as unknown as Parameters<typeof reorderRulesSdk.update>[1]
        )
        if (!response) throw new Error("Failed to update reorder rule")

        toast.success("Reorder rule updated successfully")
      } else {
        const createData = {
          ...formData,
          supplier_id: formData.supplier_id || undefined,
        } as CreateReorderRule

        const response = await reorderRulesSdk.create(
          createData as unknown as Parameters<typeof reorderRulesSdk.create>[0]
        )
        if (!response) throw new Error("Failed to create reorder rule")

        toast.success("Reorder rule created successfully")
      }

      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving reorder rule:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save reorder rule")
    } finally {
      isSavingRef.current = false
      setLoading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="font-display text-base font-semibold tracking-tight">
                {rule ? "Edit reorder rule" : "Create reorder rule"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Configure supplier, reorder points, and stock thresholds.
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <ReorderRuleFormFields
              formData={formData}
              setFormData={setFormData}
              eoqData={eoqData}
              setEoqData={setEoqData}
              materialTypes={materialTypes}
              suppliers={suppliers}
              isEditing={!!rule}
              onCalculateEOQ={calculateEOQ}
              onCalculateReorderPoint={calculateReorderPoint}
            />
          </div>

          <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : rule ? "Save changes" : "Create rule"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
