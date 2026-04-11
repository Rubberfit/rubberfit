"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
import {
  type ReorderRule,
  type MaterialType,
  type Supplier,
  type CreateReorderRule,
  type UpdateReorderRule,
} from "@/app/lib/supabase"
import { reorderService } from "@/src/infrastructure/services/reorderService"
import { ReorderRuleFormFields } from "./reorder-rule-form-fields"

interface ReorderRuleModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: ReorderRule | null
  materialTypes: MaterialType[]
  suppliers: Supplier[]
  onSuccess?: () => void
}

export function ReorderRuleModal({
  open,
  onOpenChange,
  rule,
  materialTypes,
  suppliers,
  onSuccess,
}: ReorderRuleModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
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
  })

  const [eoqData, setEoqData] = useState({
    annualDemand: 10000,
    orderingCost: 50,
    holdingCost: 5,
    calculatedEOQ: 0,
  })

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
      setFormData({
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
      })
    }
  }, [rule])

  const calculateEOQ = () => {
    const { annualDemand, orderingCost, holdingCost } = eoqData
    if (annualDemand > 0 && orderingCost > 0 && holdingCost > 0) {
      const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost)
      setEoqData({ ...eoqData, calculatedEOQ: Math.round(eoq) })
      setFormData({ ...formData, reorder_quantity: Math.round(eoq) })
      toast.success(`EOQ calculated: ${Math.round(eoq)} sq ft`)
    } else {
      toast.error("Please enter valid values for EOQ calculation")
    }
  }

  const calculateReorderPoint = () => {
    const dailyUsage = eoqData.annualDemand / 365
    const leadTimeUsage = dailyUsage * formData.lead_time_days
    const safetyStock = dailyUsage * formData.safety_stock_days
    const reorderPoint = Math.round(leadTimeUsage + safetyStock)

    setFormData({ ...formData, reorder_point: reorderPoint })
    toast.success(`Reorder point calculated: ${reorderPoint} sq ft`)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

        const response = await reorderService.updateReorderRule(rule.id, updateData)
        if (!response) throw new Error("Failed to update reorder rule")

        toast.success("Reorder rule updated successfully")
      } else {
        const createData = {
          ...formData,
          supplier_id: formData.supplier_id || undefined,
        } as CreateReorderRule

        const response = await reorderService.createReorderRule(createData)
        if (!response) throw new Error("Failed to create reorder rule")

        toast.success("Reorder rule created successfully")
      }

      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error saving reorder rule:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save reorder rule")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit Reorder Rule" : "Create Reorder Rule"}</DialogTitle>
          <DialogDescription>
            Configure automatic reorder parameters for material inventory
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              className="min-h-[44px]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="min-h-[44px]">
              {loading ? "Saving..." : rule ? "Update Rule" : "Create Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
