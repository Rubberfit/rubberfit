"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Link2 } from "lucide-react"

import type {
  Supplier,
  MaterialType,
  MaterialSupplier,
  CreateMaterialSupplier,
} from "@/src/infrastructure/models/database.types"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { supplierService } from "@/src/infrastructure/services/supplierService"
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
import { Form } from "@/app/components/ui/form"
import { MaterialSupplierLinkForm } from "./material-supplier-link-form"

const materialSupplierSchema = z.object({
  material_type_id: z.string().min(1, "Material type is required"),
  supplier_id: z.string().min(1, "Supplier is required"),
  supplier_material_code: z.string().max(100).optional(),
  cost_per_sqft: z.number().min(0.01, "Cost must be greater than 0"),
  minimum_order_sqft: z.number().min(0).optional(),
  lead_time_days: z.number().min(0).optional(),
  preferred_supplier: z.boolean(),
  active: z.boolean(),
  notes: z.string().optional(),
  effective_date: z.string(),
  expiration_date: z.string().optional(),
})

type MaterialSupplierFormData = z.infer<typeof materialSupplierSchema>

interface MaterialSupplierLinkProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  materialSupplier?: MaterialSupplier | null
  defaultMaterialId?: string
  defaultSupplierId?: string
  onSuccess: () => void
}

export function MaterialSupplierLink({
  open,
  onOpenChange,
  materialSupplier,
  defaultMaterialId,
  defaultSupplierId,
  onSuccess,
}: MaterialSupplierLinkProps) {
  const [submitting, setSubmitting] = useState(false)
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const form = useForm<MaterialSupplierFormData>({
    resolver: zodResolver(materialSupplierSchema),
    defaultValues: {
      material_type_id: defaultMaterialId || "",
      supplier_id: defaultSupplierId || "",
      supplier_material_code: "",
      cost_per_sqft: 0,
      minimum_order_sqft: undefined,
      lead_time_days: undefined,
      preferred_supplier: false,
      active: true,
      notes: "",
      effective_date: new Date().toISOString().split("T")[0],
      expiration_date: "",
    },
  })

  const fetchData = useCallback(async () => {
    setLoadingData(true)
    try {
      const [materialsData, suppliersData] = await Promise.all([
        materialTypeService.getAll(),
        supplierService.getActiveSuppliers(),
      ])

      setMaterials(materialsData)
      setSuppliers(suppliersData)
    } catch (error) {
      console.error("Error fetching data:", error)
      toast.error("Failed to load data")
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchData()
    }
  }, [open, fetchData])

  useEffect(() => {
    if (materialSupplier) {
      form.reset({
        material_type_id: materialSupplier.material_type_id,
        supplier_id: materialSupplier.supplier_id,
        supplier_material_code: materialSupplier.supplier_material_code || "",
        cost_per_sqft: materialSupplier.cost_per_sqft,
        minimum_order_sqft: materialSupplier.minimum_order_sqft || undefined,
        lead_time_days: materialSupplier.lead_time_days || undefined,
        preferred_supplier: materialSupplier.preferred_supplier,
        active: materialSupplier.active,
        notes: materialSupplier.notes || "",
        effective_date: materialSupplier.effective_date,
        expiration_date: materialSupplier.expiration_date || "",
      })
    } else {
      form.reset({
        material_type_id: defaultMaterialId || "",
        supplier_id: defaultSupplierId || "",
        supplier_material_code: "",
        cost_per_sqft: 0,
        minimum_order_sqft: undefined,
        lead_time_days: undefined,
        preferred_supplier: false,
        active: true,
        notes: "",
        effective_date: new Date().toISOString().split("T")[0],
        expiration_date: "",
      })
    }
  }, [materialSupplier, defaultMaterialId, defaultSupplierId, form])

  const onSubmit = async (data: MaterialSupplierFormData) => {
    setSubmitting(true)
    try {
      // Check for existing link if creating new
      if (!materialSupplier) {
        const existingLink = await supplierService.checkMaterialSupplierLink(
          data.material_type_id,
          data.supplier_id
        )

        if (existingLink) {
          toast.error("This material-supplier link already exists")
          setSubmitting(false)
          return
        }
      }

      const linkData: CreateMaterialSupplier = {
        material_type_id: data.material_type_id,
        supplier_id: data.supplier_id,
        supplier_material_code: data.supplier_material_code?.trim() || undefined,
        cost_per_sqft: data.cost_per_sqft,
        minimum_order_sqft: data.minimum_order_sqft || undefined,
        lead_time_days: data.lead_time_days || undefined,
        preferred_supplier: data.preferred_supplier,
        active: data.active,
        notes: data.notes?.trim() || undefined,
        effective_date: data.effective_date,
        expiration_date: data.expiration_date || undefined,
      }

      if (materialSupplier) {
        await supplierService.updateMaterialSupplier(materialSupplier.id, linkData)
        toast.success("Material-supplier link updated successfully")
      } else {
        await supplierService.linkMaterialToSupplier(linkData)
        toast.success("Material-supplier link created successfully")
      }

      onSuccess()
    } catch (error) {
      console.error("Error saving material-supplier link:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save material-supplier link")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMaterial = materials.find((m) => m.id === form.watch("material_type_id"))
  const _selectedSupplier = suppliers.find((s) => s.id === form.watch("supplier_id"))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {materialSupplier ? "Edit Material-Supplier Link" : "Link Material to Supplier"}
          </DialogTitle>
          <DialogDescription>
            Configure pricing and ordering details for materials from suppliers
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <MaterialSupplierLinkForm
                form={form}
                materials={materials}
                suppliers={suppliers}
                materialSupplier={materialSupplier}
                defaultMaterialId={defaultMaterialId}
                defaultSupplierId={defaultSupplierId}
                selectedMaterial={selectedMaterial}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                  className="min-h-[44px]"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting} className="min-h-[44px]">
                  {submitting ? "Saving..." : materialSupplier ? "Update Link" : "Create Link"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
