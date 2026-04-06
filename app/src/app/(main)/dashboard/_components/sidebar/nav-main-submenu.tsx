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

export function QuickCreateDialog({ open, onOpenChange, initialData }: QuickCreateDialogProps) {
  const router = useRouter()
  const [materialTypes, setMaterialTypes] = useState<string[]>([])
  const [formData, setFormData] = useState({
    material_type: "",
    width: "",
    length: "",
    thickness: "",
    color: "",
    location: "",
    supplier: "",
    cost_per_sqft: "",
    notes: "",
  })

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

  // Apply initial data when it changes
  useEffect(() => {
    if (initialData) {
      queueMicrotask(() => {
        setFormData((prev) => ({
          ...prev,
          material_type: initialData.material_type || prev.material_type,
          width: initialData.width || prev.width,
          length: initialData.length || prev.length,
          thickness: initialData.thickness || prev.thickness,
          notes: initialData.notes || prev.notes,
        }))
      })
    }
  }, [initialData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (!formData.material_type || !formData.width || !formData.length || !formData.thickness) {
        toast.error("Please fill in all required fields")
        return
      }

      await rollService.addRoll({
        material_type: formData.material_type,
        width: parseFloat(formData.width),
        length: parseFloat(formData.length),
        thickness: parseFloat(formData.thickness),
        color: formData.color || undefined,
        location: formData.location || undefined,
        supplier: formData.supplier || undefined,
        cost_per_sqft: formData.cost_per_sqft ? parseFloat(formData.cost_per_sqft) : undefined,
        notes: formData.notes || undefined,
        remaining_length: parseFloat(formData.length),
        status: "active",
        date_received: new Date().toISOString().split("T")[0],
      } as Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">)

      toast.success("Roll added successfully!")
      onOpenChange(false)

      setFormData({
        material_type: "",
        width: "",
        length: "",
        thickness: "",
        color: "",
        location: "",
        supplier: "",
        cost_per_sqft: "",
        notes: "",
      })

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
