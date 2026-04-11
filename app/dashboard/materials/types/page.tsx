"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { type MaterialType } from "@/app/lib/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"

import { MaterialTypesTable } from "../_components/material-types-table"
import { MaterialTypeDialog } from "../_components/material-type-dialog"

interface MaterialTypeForm {
  name: string
  description: string
  default_cost: string
  min_stock_alert: string
}

export default function MaterialTypesPage() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<MaterialType | null>(null)
  const [formData, setFormData] = useState<MaterialTypeForm>({
    name: "",
    description: "",
    default_cost: "",
    min_stock_alert: "",
  })
  const [submitting, setSubmitting] = useState(false)

  const fetchMaterialTypes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await materialTypeService.getAll()
      setMaterialTypes(data)
    } catch (error) {
      console.error("Error fetching material types:", error)
      toast.error("Failed to load material types")
    } finally {
      setLoading(false)
    }
  }, [])

  const openAddDialog = () => {
    setEditingType(null)
    setFormData({
      name: "",
      description: "",
      default_cost: "",
      min_stock_alert: "",
    })
    setDialogOpen(true)
  }

  const openEditDialog = (materialType: MaterialType) => {
    setEditingType(materialType)
    setFormData({
      name: materialType.name,
      description: materialType.description || "",
      default_cost: materialType.default_cost?.toString() || "",
      min_stock_alert: materialType.min_stock_alert?.toString() || "",
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Material name is required")
      return
    }

    setSubmitting(true)
    try {
      const materialData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        default_cost: formData.default_cost ? parseFloat(formData.default_cost) : undefined,
        min_stock_alert: formData.min_stock_alert
          ? parseFloat(formData.min_stock_alert)
          : undefined,
      }

      if (editingType) {
        await materialTypeService.update(editingType.id, materialData)
        toast.success("Material type updated successfully")
      } else {
        await materialTypeService.create(materialData)
        toast.success("Material type created successfully")
      }

      setDialogOpen(false)
      fetchMaterialTypes()
    } catch (error) {
      console.error("Error saving material type:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save material type")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (materialType: MaterialType) => {
    if (
      !confirm(
        `Are you sure you want to delete ${materialType.name}? This action cannot be undone.`
      )
    ) {
      return
    }

    try {
      await materialTypeService.delete(materialType.id)
      toast.success("Material type deleted successfully")
      fetchMaterialTypes()
    } catch (error) {
      console.error("Error deleting material type:", error)
      toast.error(error instanceof Error ? error.message : "Failed to delete material type")
    }
  }

  useEffect(() => {
    fetchMaterialTypes()
  }, [fetchMaterialTypes])

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Material Types</h1>
          <p className="text-muted-foreground">
            Manage rubber material categories and their properties
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Material Type
        </Button>
      </div>

      <MaterialTypesTable
        materialTypes={materialTypes}
        loading={loading}
        onEdit={openEditDialog}
        onDelete={handleDelete}
      />

      <MaterialTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEditing={!!editingType}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  )
}
