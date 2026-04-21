"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Input } from "@/app/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Scissors } from "lucide-react"
import type { Roll } from "@/src/infrastructure/models/database.types"
import { SelectedRollInfo } from "./roll-selector"
import type { UseFormReturn } from "react-hook-form"

interface CutRequest {
  width: number
  length: number
  quantity: number
}

interface CutRequirementsFormProps {
  form: UseFormReturn<CutRequest>
  rollRanges: {
    minWidth: number
    maxWidth: number
    maxLength: number
  } | null
  selectedRoll: Roll | null
  wasteCalculation: {
    totalLengthNeeded: number
    materialUsedSqft: number
    totalConsumedSqft: number
    wasteSqft: number
    wastePercentage: number
    remainingAfter: number
    canFit: boolean
  } | null
  onSubmit: (data: CutRequest) => void
  calculateWaste: (roll: Roll) => void
}

export function CutRequirementsForm({
  form,
  rollRanges,
  selectedRoll,
  wasteCalculation,
  onSubmit,
  calculateWaste,
}: CutRequirementsFormProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          Cut Requirements
        </CardTitle>
        <CardDescription>Enter your cutting requirements first</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="width"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Width Needed (inches)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder={
                        rollRanges
                          ? `e.g. ${rollRanges.minWidth}\u2013${rollRanges.maxWidth}`
                          : "12"
                      }
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                        if (selectedRoll) calculateWaste(selectedRoll)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="length"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Length Needed (inches)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.001"
                      placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "24"}
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => {
                        field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)
                        if (selectedRoll) calculateWaste(selectedRoll)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantity</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      placeholder="1"
                      {...field}
                      onChange={(e) => {
                        field.onChange(parseInt(e.target.value) || 1)
                        if (selectedRoll) calculateWaste(selectedRoll)
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedRoll && wasteCalculation && (
              <SelectedRollInfo selectedRoll={selectedRoll} wasteCalculation={wasteCalculation} />
            )}

            {!selectedRoll && (
              <div className="p-4 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                Select a roll from the inventory list
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
