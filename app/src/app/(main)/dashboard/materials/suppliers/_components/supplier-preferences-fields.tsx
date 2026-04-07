"use client"

import { type UseFormReturn } from "react-hook-form"
import { CreditCard, Star } from "lucide-react"

import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import type { SupplierFormData } from "./supplier-form-schema"

interface SupplierPreferencesFieldsProps {
  form: UseFormReturn<SupplierFormData>
}

export function SupplierPreferencesFields({ form }: SupplierPreferencesFieldsProps) {
  return (
    <div className="grid gap-4">
      <FormField
        control={form.control}
        name="payment_terms"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              <CreditCard className="inline h-4 w-4 mr-2" />
              Payment Terms
            </FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select payment terms" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                <SelectItem value="Net 15">Net 15</SelectItem>
                <SelectItem value="Net 30">Net 30</SelectItem>
                <SelectItem value="Net 45">Net 45</SelectItem>
                <SelectItem value="Net 60">Net 60</SelectItem>
                <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="rating"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              <Star className="inline h-4 w-4 mr-2" />
              Supplier Rating
            </FormLabel>
            <Select
              onValueChange={(value) => {
                field.onChange(value === "none" ? undefined : parseInt(value, 10))
              }}
              value={field.value?.toString() ?? "none"}
            >
              <FormControl>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Select rating" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="none">No rating</SelectItem>
                <SelectItem value="1">1 Star - Poor</SelectItem>
                <SelectItem value="2">2 Stars - Below Average</SelectItem>
                <SelectItem value="3">3 Stars - Average</SelectItem>
                <SelectItem value="4">4 Stars - Good</SelectItem>
                <SelectItem value="5">5 Stars - Excellent</SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>Rate supplier performance and reliability</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-4">
        <FormField
          control={form.control}
          name="preferred"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Preferred Supplier</FormLabel>
                <FormDescription>Mark as a preferred vendor for priority ordering</FormDescription>
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
                <FormLabel className="text-base">Active Status</FormLabel>
                <FormDescription>Enable or disable this supplier for new orders</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Additional notes about this supplier..."
                className="resize-none"
                rows={4}
                {...field}
              />
            </FormControl>
            <FormDescription>
              Internal notes about the supplier (not visible to vendor)
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
