"use client"

import { DollarSign, Clock, ShoppingCart } from "lucide-react"

import type { MaterialType } from "@/src/infrastructure/models/supabase"
import { Input } from "@/app/components/ui/input"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
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

interface MaterialSupplierPricingSectionProps {
  form: UseFormReturn<MaterialSupplierFormData>
  selectedMaterial: MaterialType | undefined
}

export function MaterialSupplierPricingSection({
  form,
  selectedMaterial,
}: MaterialSupplierPricingSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing & Terms</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="cost_per_sqft"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <DollarSign className="inline h-4 w-4 mr-2" />
                  Cost per sq ft *
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="2.50"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="min-h-[44px]"
                  />
                </FormControl>
                {selectedMaterial?.default_cost && (
                  <FormDescription>
                    Default: ${selectedMaterial.default_cost.toFixed(2)}
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="minimum_order_sqft"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <ShoppingCart className="inline h-4 w-4 mr-2" />
                  Minimum Order (sq ft)
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="500"
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    className="min-h-[44px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="lead_time_days"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Clock className="inline h-4 w-4 mr-2" />
                Lead Time (days)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="14"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  className="min-h-[44px]"
                />
              </FormControl>
              <FormDescription>
                Standard delivery time for this material from this supplier
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4 items-start">
          <FormField
            control={form.control}
            name="effective_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Effective Date *</FormLabel>
                <FormControl>
                  <Input type="date" {...field} className="min-h-[44px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiration_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expiration Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} className="min-h-[44px]" />
                </FormControl>
                <FormDescription>Leave blank for no expiration</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}
