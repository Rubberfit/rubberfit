"use client"

import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"

import type {
  CreateMaterialSupplier,
  MaterialSupplier,
  MaterialType,
  Supplier,
} from "@/src/infrastructure/models/supabase"
import {
  materialSuppliers as materialSuppliersSdk,
  materialTypes as materialTypesSdk,
  suppliers as suppliersSdk,
} from "@/src/infrastructure/api-client/rf/inventory"
import { Button } from "@/app/components/ui/button"
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

interface MaterialSupplierLinkInlineProps {
  materialSupplier?: MaterialSupplier | null
  defaultSupplierId: string
  onCancel: () => void
  onSuccess: () => void
}

/**
 * Inline material-supplier link form — Phase 3 PR 3h.
 *
 * Replaces the previous nested Dialog (`MaterialSupplierLink`) with
 * an inline form rendered inside the supplier form's Materials tab.
 * No more sheet-inside-sheet UX. Owns its own `useForm` + submit
 * state since it's wired directly to the SDK, not to the parent
 * supplier form's RHF context.
 */
export function MaterialSupplierLinkInline({
  materialSupplier,
  defaultSupplierId,
  onCancel,
  onSuccess,
}: MaterialSupplierLinkInlineProps) {
  const [submitting, setSubmitting] = useState(false)
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const form = useForm<MaterialSupplierFormData>({
    resolver: zodResolver(materialSupplierSchema),
    defaultValues: {
      material_type_id: "",
      supplier_id: defaultSupplierId,
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
        materialTypesSdk.list(),
        suppliersSdk.list({ active: true }),
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
    void fetchData()
  }, [fetchData])

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
    }
  }, [materialSupplier, form])

  const onSubmit = async (data: MaterialSupplierFormData) => {
    if (submitting) return
    setSubmitting(true)
    try {
      // Pre-flight duplicate check — the SDK list scopes to a
      // single material_type, so we filter client-side by
      // supplier_id. The backend's 409 DUPLICATE_PAIR is the
      // backstop if a concurrent request races this check.
      if (!materialSupplier) {
        const existingLinks = await materialSuppliersSdk.list({
          material_type_id: data.material_type_id,
        })
        const existingLink = existingLinks.find((l) => l.supplier_id === data.supplier_id)

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
        await materialSuppliersSdk.update(
          materialSupplier.id,
          linkData as unknown as Parameters<typeof materialSuppliersSdk.update>[1]
        )
        toast.success("Material-supplier link updated")
      } else {
        await materialSuppliersSdk.create(
          linkData as unknown as Parameters<typeof materialSuppliersSdk.create>[0]
        )
        toast.success("Material-supplier link created")
      }

      onSuccess()
    } catch (error) {
      console.error("Error saving material-supplier link:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save link")
    } finally {
      setSubmitting(false)
    }
  }

  const selectedMaterial = materials.find((m) => m.id === form.watch("material_type_id"))

  if (loadingData) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          // The parent (`SupplierFormSheet`) also has an outer
          // form; stopping propagation prevents the outer form's
          // submit from firing when the user presses Enter inside
          // the inline link form.
          e.stopPropagation()
          void form.handleSubmit(onSubmit)(e)
        }}
        className="space-y-6 rounded-lg border bg-card p-4"
      >
        <MaterialSupplierLinkForm
          form={form}
          materials={materials}
          suppliers={suppliers}
          materialSupplier={materialSupplier}
          defaultSupplierId={defaultSupplierId}
          selectedMaterial={selectedMaterial}
        />

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : materialSupplier ? "Save link" : "Create link"}
          </Button>
        </div>
      </form>
    </Form>
  )
}
