"use client"

import { Building, Mail, Phone, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import type { UseFormReturn } from "react-hook-form"
import type { SupplierFormData } from "./supplier-form-schema"

interface SupplierGeneralFieldsProps {
  form: UseFormReturn<SupplierFormData>
}

export function SupplierGeneralFields({ form }: SupplierGeneralFieldsProps) {
  return (
    <>
      <div className="grid gap-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Building className="inline h-4 w-4 mr-2" />
                Company Name *
              </FormLabel>
              <FormControl>
                <Input placeholder="ABC Rubber Supply Co." {...field} className="min-h-[44px]" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contact_person"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact Person</FormLabel>
                <FormControl>
                  <Input placeholder="John Smith" {...field} className="min-h-[44px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tax_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tax ID / EIN</FormLabel>
                <FormControl>
                  <Input placeholder="12-3456789" {...field} className="min-h-[44px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Mail className="inline h-4 w-4 mr-2" />
                  Email
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="contact@supplier.com"
                    {...field}
                    className="min-h-[44px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Phone className="inline h-4 w-4 mr-2" />
                  Phone
                </FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="(555) 123-4567"
                    {...field}
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
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Globe className="inline h-4 w-4 mr-2" />
                Website
              </FormLabel>
              <FormControl>
                <Input
                  type="url"
                  placeholder="https://www.supplier.com"
                  {...field}
                  className="min-h-[44px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  )
}
