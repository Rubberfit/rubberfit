"use client"

import { Switch } from "@/app/components/ui/switch"
import { Textarea } from "@/app/components/ui/textarea"
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

interface MaterialSupplierPreferencesProps {
  form: UseFormReturn<MaterialSupplierFormData>
}

export function MaterialSupplierPreferences({ form }: MaterialSupplierPreferencesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="preferred_supplier"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Preferred Supplier for Material</FormLabel>
                <FormDescription>
                  Mark this supplier as preferred for this specific material
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="active"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Active</FormLabel>
                <FormDescription>
                  Enable or disable this material-supplier relationship
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Special terms, conditions, or notes about this material-supplier relationship..."
                  className="resize-none"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  )
}
