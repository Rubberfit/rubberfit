"use client"

import { type UseFormReturn } from "react-hook-form"
import { MapPin } from "lucide-react"

import { Input } from "@/app/components/ui/input"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form"
import type { SupplierFormData } from "./supplier-form-schema"

interface SupplierAddressFieldsProps {
  form: UseFormReturn<SupplierFormData>
}

export function SupplierAddressFields({ form }: SupplierAddressFieldsProps) {
  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              <MapPin className="inline h-4 w-4 mr-2" />
              Street Address
            </FormLabel>
            <FormControl>
              <Input placeholder="123 Industrial Blvd" {...field} className="min-h-[44px]" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-3 gap-4 items-start">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input placeholder="Columbus" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State / Province</FormLabel>
              <FormControl>
                <Input
                  placeholder="OH or Ohio"
                  {...field}
                  className="min-h-[44px]"
                  maxLength={50}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="zip_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>ZIP / Postal Code</FormLabel>
              <FormControl>
                <Input placeholder="43215" {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="country"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <FormControl>
              <Input placeholder="USA" {...field} className="min-h-[44px]" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
