"use client"

import { Loader2 } from "lucide-react"
import { Input } from "@/app/components/ui/input"
import { Switch } from "@/app/components/ui/switch"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
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
import type { UseFormReturn } from "react-hook-form"
import type { SupplierFormData } from "./supplier-form-schema"

interface SupplierShippingFieldsProps {
  form: UseFormReturn<SupplierFormData>
  resolvedTaxRate: { rate: number; name: string; level: string } | null
  loadingTaxRate: boolean
}

export function SupplierShippingFields({
  form,
  resolvedTaxRate,
  loadingTaxRate,
}: SupplierShippingFieldsProps) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tax Configuration</CardTitle>
          <CardDescription>
            Location-based tax rates will be calculated using the address information from the
            Address tab
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {/* Show current location for tax calculation */}
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium mb-2">Tax Calculation Location:</p>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>City: {form.watch("city") || "Not set"}</span>
              <span>State: {form.watch("state") || "Not set"}</span>
              <span>ZIP: {form.watch("zip_code") || "Not set"}</span>
            </div>
            {loadingTaxRate && (
              <div className="flex items-center gap-2 mt-2 text-xs text-blue-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Looking up tax rate...
              </div>
            )}
            {resolvedTaxRate && !loadingTaxRate && (
              <div className="mt-2 p-2 rounded bg-green-50 border border-green-200">
                <p className="text-sm font-medium text-green-800">
                  Tax Rate: {(resolvedTaxRate.rate * 100).toFixed(3)}%
                </p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Tax rates are automatically looked up when a ZIP code is provided
            </p>
          </div>

          <FormField
            control={form.control}
            name="tax_exempt"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Tax Exempt Status</FormLabel>
                  <FormDescription>
                    Mark this supplier as tax exempt (no tax will be charged)
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </FormItem>
            )}
          />

          {!form.watch("tax_exempt") && (
            <FormField
              control={form.control}
              name="tax_rate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Override Tax Rate (%)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="Leave empty for automatic"
                      value={(field.value || 0) * 100}
                      onChange={(e) => {
                        const percentage = parseFloat(e.target.value) || 0
                        field.onChange(percentage / 100)
                      }}
                      className="min-h-[44px]"
                    />
                  </FormControl>
                  <FormDescription>
                    Override location-based tax calculation. Leave at 0 to use automatic rates based
                    on location.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Configuration</CardTitle>
          <CardDescription>Configure default shipping costs and calculation method</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormField
            control={form.control}
            name="shipping_calculation_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Shipping Calculation Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value || "flat"}>
                  <FormControl>
                    <SelectTrigger className="min-h-[44px]">
                      <SelectValue placeholder="Select calculation type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="flat">Flat Rate</SelectItem>
                    <SelectItem value="weight">By Weight</SelectItem>
                    <SelectItem value="percentage">Percentage of Total</SelectItem>
                    <SelectItem value="custom">Custom Calculation</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {form.watch("shipping_calculation_type") === "flat" && (
            <FormField
              control={form.control}
              name="default_shipping_cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Shipping Cost ($)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="50.00"
                      value={field.value || 0}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      className="min-h-[44px]"
                    />
                  </FormControl>
                  <FormDescription>Default shipping cost for purchase orders</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
