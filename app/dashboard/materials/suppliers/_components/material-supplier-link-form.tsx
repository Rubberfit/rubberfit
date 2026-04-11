"use client"

import type { MaterialType, Supplier, MaterialSupplier } from "@/src/infrastructure/models/supabase"
import { MaterialSupplierPreferences } from "./material-supplier-preferences"
import { MaterialSupplierSelectionSection } from "./material-supplier-selection-section"
import { MaterialSupplierPricingSection } from "./material-supplier-pricing-section"
import type { UseFormReturn } from "react-hook-form"

interface MaterialSupplierFormData {
  material_type_id: string
  supplier_id: string
  supplier_material_code?: string
  cost_per_sqft: number
  minimum_order_sqft?: number
  lead_time_days?: number
  preferred_supplier: boolean
  active: boolean
  notes?: string
  effective_date: string
  expiration_date?: string
}

interface MaterialSupplierLinkFormProps {
  form: UseFormReturn<MaterialSupplierFormData>
  materials: MaterialType[]
  suppliers: Supplier[]
  materialSupplier?: MaterialSupplier | null
  defaultMaterialId?: string
  defaultSupplierId?: string
  selectedMaterial: MaterialType | undefined
}

export function MaterialSupplierLinkForm({
  form,
  materials,
  suppliers,
  materialSupplier,
  defaultMaterialId,
  defaultSupplierId,
  selectedMaterial,
}: MaterialSupplierLinkFormProps) {
  return (
    <>
      <MaterialSupplierSelectionSection
        form={form}
        materials={materials}
        suppliers={suppliers}
        materialSupplier={materialSupplier}
        defaultMaterialId={defaultMaterialId}
        defaultSupplierId={defaultSupplierId}
      />

      <MaterialSupplierPricingSection form={form} selectedMaterial={selectedMaterial} />

      <MaterialSupplierPreferences form={form} />
    </>
  )
}
