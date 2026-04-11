"use client"

import type { UseFormReturn } from "react-hook-form"
import type * as z from "zod"

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
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"

import type { MaterialType } from "@/src/infrastructure/models/supabase"
import { SupplierSelect } from "../materials/suppliers/_components/supplier-selection"
import { supplierService } from "@/src/infrastructure/services/supplierService"
import type { rollFormSchema } from "./roll-form-dialog"

type RollFormValues = z.infer<typeof rollFormSchema>

interface RollFormFieldsProps {
  form: UseFormReturn<RollFormValues>
  materialTypes: MaterialType[]
  isEdit: boolean
}

export function RollFormFields({ form, materialTypes, isEdit }: RollFormFieldsProps) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Material Type */}
        <FormField
          control={form.control}
          name="material_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Material Type *</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select material type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {materialTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Color */}
        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Black, Red" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Width */}
        <FormField
          control={form.control}
          name="width"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Width (inches) *</FormLabel>
              <FormControl>
                <Input type="number" step="0.001" placeholder="48" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Length */}
        <FormField
          control={form.control}
          name="length"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Length (inches) *</FormLabel>
              <FormControl>
                <Input type="number" step="0.001" placeholder="600" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Thickness */}
        <FormField
          control={form.control}
          name="thickness"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Thickness (inches) *</FormLabel>
              <FormControl>
                <Input type="number" step="0.001" placeholder="0.25" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Remaining Length (only for edit) */}
        {isEdit && (
          <FormField
            control={form.control}
            name="remaining_length"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Remaining Length (inches)</FormLabel>
                <FormControl>
                  <Input type="number" step="0.001" placeholder="Remaining length" {...field} />
                </FormControl>
                <FormDescription>Adjust for manual corrections</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Location */}
        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Rack A1, Warehouse B" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Date Received */}
        <FormField
          control={form.control}
          name="date_received"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date Received *</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Supplier */}
        <FormField
          control={form.control}
          name="supplier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supplier</FormLabel>
              <FormControl>
                <SupplierSelect
                  value={field.value}
                  onValueChange={(value) => {
                    supplierService
                      .getSupplierById(value)
                      .then((supplier) => {
                        field.onChange(supplier?.name ?? "")
                      })
                      .catch((error) => {
                        console.error("Error resolving supplier name:", error)
                      })
                  }}
                  placeholder="Select supplier"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Cost per sqft */}
        <FormField
          control={form.control}
          name="cost_per_sqft"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cost per sqft ($)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="2.50" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* Notes */}
      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea placeholder="Any additional notes..." className="resize-none" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
