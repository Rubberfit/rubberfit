"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { format } from "date-fns"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Form } from "@/app/components/ui/form"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"

import { rollService } from "@/src/infrastructure/services/rollService"
import type { Roll, MaterialType } from "@/src/infrastructure/models/database.types"
import { RollFormFields } from "./roll-form-fields"

export const rollFormSchema = z.object({
  material_type: z.string().min(1, "Material type is required"),
  width: z.coerce.number().positive("Width must be greater than 0"),
  length: z.coerce.number().positive("Length must be greater than 0"),
  thickness: z.coerce.number().positive("Thickness must be greater than 0"),
  color: z.string().optional(),
  location: z.string().optional(),
  date_received: z.string().min(1, "Date received is required"),
  supplier: z.string().optional(),
  cost_per_sqft: z.coerce.number().min(0, "Cost must be 0 or greater").optional(),
  notes: z.string().optional(),
  remaining_length: z.coerce.number().min(0).optional(),
})

type RollFormValues = z.infer<typeof rollFormSchema>

interface RollFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roll?: Roll | null
  onSuccess?: () => void
}

export function RollFormDialog({ open, onOpenChange, roll, onSuccess }: RollFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const isEdit = !!roll

  const form = useForm<RollFormValues>({
    resolver: zodResolver(rollFormSchema),
    defaultValues: {
      material_type: "",
      width: 0,
      length: 0,
      thickness: 0,
      color: "",
      location: "",
      date_received: format(new Date(), "yyyy-MM-dd"),
      supplier: "",
      cost_per_sqft: 2.5,
      notes: "",
      remaining_length: undefined,
    },
  })

  // Fetch material types on mount
  useEffect(() => {
    const fetchMaterialTypes = async () => {
      try {
        const types = await rollService.getMaterialTypes()
        setMaterialTypes(types)
      } catch (error) {
        console.error("Error fetching material types:", error)
        toast.error("Failed to load material types")
      }
    }
    fetchMaterialTypes()
  }, [])

  // Reset form when roll changes or dialog opens
  useEffect(() => {
    if (roll) {
      form.reset({
        material_type: roll.material_type,
        width: roll.width,
        length: roll.length,
        thickness: roll.thickness,
        color: roll.color ?? "",
        location: roll.location ?? "",
        date_received: roll.date_received
          ? format(new Date(roll.date_received), "yyyy-MM-dd")
          : format(new Date(), "yyyy-MM-dd"),
        supplier: roll.supplier ?? "",
        cost_per_sqft: roll.cost_per_sqft ?? 2.5,
        notes: roll.notes ?? "",
        remaining_length: roll.remaining_length,
      })
    } else {
      form.reset({
        material_type: "",
        width: 0,
        length: 0,
        thickness: 0,
        color: "",
        location: "",
        date_received: format(new Date(), "yyyy-MM-dd"),
        supplier: "",
        cost_per_sqft: 2.5,
        notes: "",
        remaining_length: undefined,
      })
    }
  }, [roll, open, form])

  const onSubmit = async (values: RollFormValues) => {
    setLoading(true)
    try {
      if (isEdit && roll) {
        await rollService.updateRoll(roll.id, {
          ...values,
          remaining_length: values.remaining_length ?? values.length,
        })
        toast.success("Roll updated successfully")
      } else {
        await rollService.addRoll({
          ...values,
          remaining_length: values.length,
          status: "active",
        } as Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">)
        toast.success("Roll added successfully")
      }

      onSuccess?.()
      onOpenChange(false)
      form.reset()
    } catch (error) {
      console.error("Error saving roll:", error)
      toast.error(isEdit ? "Failed to update roll" : "Failed to add roll", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Roll" : "Add New Roll"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details of this roll."
              : "Enter the details of the new roll to add to inventory."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <RollFormFields form={form} materialTypes={materialTypes} isEdit={isEdit} />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? isEdit
                    ? "Updating..."
                    : "Adding..."
                  : isEdit
                    ? "Update Roll"
                    : "Add Roll"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
