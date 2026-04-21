"use client"

import { Package } from "lucide-react"

import type { MaterialType, Supplier, MaterialSupplier } from "@/src/entities"
import { Input } from "@/app/components/ui/input"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
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

interface MaterialSupplierSelectionSectionProps {
  form: UseFormReturn<MaterialSupplierFormData>
  materials: MaterialType[]
  suppliers: Supplier[]
  materialSupplier?: MaterialSupplier | null
  defaultMaterialId?: string
  defaultSupplierId?: string
}

export function MaterialSupplierSelectionSection({
  form,
  materials,
  suppliers,
  materialSupplier,
  defaultMaterialId,
  defaultSupplierId,
}: MaterialSupplierSelectionSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Material & Supplier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="material_type_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Package className="inline h-4 w-4 mr-2" />
                Material Type *
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!!materialSupplier || !!defaultMaterialId}
              >
                <FormControl>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Select material type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {materials.map((material) => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name}
                      {material.default_cost && (
                        <span className="text-muted-foreground ml-2">
                          (${material.default_cost}/sq ft)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supplier_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Package className="inline h-4 w-4 mr-2" />
                Supplier *
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!!materialSupplier || !!defaultSupplierId}
              >
                <FormControl>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      <div className="flex items-center gap-2">
                        {supplier.name}
                        {supplier.preferred && (
                          <Badge variant="secondary" className="ml-2">
                            Preferred
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supplier_material_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supplier Material Code</FormLabel>
              <FormControl>
                <Input placeholder="e.g., NEO-4870-BK" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormDescription>The supplier&apos;s internal code for this material</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
