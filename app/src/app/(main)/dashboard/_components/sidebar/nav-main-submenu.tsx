"use client"

import { useState, useEffect } from "react"

import { materialTypeService } from "@/services/materialTypeService"
import { rollService } from "@/services/rollService"
import type { Roll } from "@/lib/supabase"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { QuickCreateForm } from "./quick-create-form"

interface QuickCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: Partial<{
    material_type: string
    width: string
    length: string
    thickness: string
    notes: string
  }>
}

const EMPTY_FORM_DATA = {
  material_type: "",
  width: "",
  length: "",
  thickness: "",
  color: "",
  location: "",
  supplier: "",
  cost_per_sqft: "",
  notes: "",
}

export function QuickCreateDialog({ open, onOpenChange, initialData }: QuickCreateDialogProps) {
  const router = useRouter()
  const [materialTypes, setMaterialTypes] = useState<string[]>([])
  const [formData, setFormData] = useState(() => ({ ...EMPTY_FORM_DATA }))

  useEffect(() => {
    const loadMaterialTypes = async () => {
      try {
        const data = await materialTypeService.getNames()
        setMaterialTypes(data.map((m) => m.name))
      } catch (error) {
        console.error("Error loading material types:", error)
      }
    }
    loadMaterialTypes()
  }, [])

  useEffect(() => {
    const nextFormData = open
      ? {
          ...EMPTY_FORM_DATA,
          ...initialData,
        }
      : { ...EMPTY_FORM_DATA }

    const timeoutId = window.setTimeout(() => {
      setFormData(nextFormData)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [open, initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const width = Number(formData.width)
      const length = Number(formData.length)
      const thickness = Number(formData.thickness)
      const costPerSqft = formData.cost_per_sqft === "" ? undefined : Number(formData.cost_per_sqft)

      if (
        !formData.material_type ||
        !Number.isFinite(width) ||
        width <= 0 ||
        !Number.isFinite(length) ||
        length <= 0 ||
        !Number.isFinite(thickness) ||
        thickness <= 0 ||
        (costPerSqft !== undefined && (!Number.isFinite(costPerSqft) || costPerSqft < 0))
      ) {
        toast.error("Please enter valid values for all required fields")
        return
      }

      await rollService.addRoll({
        material_type: formData.material_type,
        width,
        length,
        thickness,
        color: formData.color || undefined,
        location: formData.location || undefined,
        supplier: formData.supplier || undefined,
        cost_per_sqft: costPerSqft,
        notes: formData.notes || undefined,
        remaining_length: length,
        status: "active",
        date_received: new Date().toISOString().split("T")[0],
      } as Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">)

      toast.success("Roll added successfully!")
      onOpenChange(false)

      setFormData({ ...EMPTY_FORM_DATA })

      router.push("/dashboard/inventory")
    } catch (error) {
      console.error("Error adding roll:", error)
      toast.error("Failed to add roll")
    }
  }

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Roll</DialogTitle>
          <DialogDescription>
            Add a new rubber roll to inventory. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <QuickCreateForm
          formData={formData}
          materialTypes={materialTypes}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
