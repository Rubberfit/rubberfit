"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { type MaterialType } from "@/src/entities"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { rollService } from "@/src/infrastructure/services/rollService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

import { MaterialConfigList } from "./_components/material-config-list"
import { MaterialDialogs } from "./_components/material-dialogs"

export default function MaterialSettingsPage() {
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [editedValues, setEditedValues] = useState<{
    [key: string]: { min_stock_alert: number; default_cost: number }
  }>({})
  const [newMaterialDialog, setNewMaterialDialog] = useState(false)
  const [deleteMaterialDialog, setDeleteMaterialDialog] = useState<string | null>(null)
  const [newMaterial, setNewMaterial] = useState({
    name: "",
    description: "",
    default_cost: 2.5,
    min_stock_alert: 100,
  })

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true)
      const data = await materialTypeService.getAll()
      setMaterials(data)
      // Initialize edited values
      const initialValues: { [key: string]: { min_stock_alert: number; default_cost: number } } = {}
      data.forEach((material) => {
        initialValues[material.id] = {
          min_stock_alert: material.min_stock_alert || 0,
          default_cost: material.default_cost || 0,
        }
      })
      setEditedValues(initialValues)
    } catch (error) {
      toast.error("Failed to load materials", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMaterials()
  }, [fetchMaterials])

  const handleValueChange = (
    materialId: string,
    field: "min_stock_alert" | "default_cost",
    value: number
  ) => {
    setEditedValues((prev) => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [field]: value,
      },
    }))
  }

  const handleSave = async (materialId: string) => {
    try {
      const values = editedValues[materialId]
      await materialTypeService.update(materialId, {
        min_stock_alert: values.min_stock_alert,
        default_cost: values.default_cost,
      })
      toast.success("Material settings saved successfully")
      fetchMaterials()
    } catch (error) {
      toast.error("Failed to save changes", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleAddMaterial = async () => {
    if (!newMaterial.name.trim()) {
      toast.error("Material name is required")
      return
    }

    try {
      await materialTypeService.create({
        name: newMaterial.name.trim(),
        description: newMaterial.description.trim(),
        default_cost: newMaterial.default_cost,
        min_stock_alert: newMaterial.min_stock_alert,
      })
      toast.success("Material added successfully")
      setNewMaterialDialog(false)
      setNewMaterial({
        name: "",
        description: "",
        default_cost: 2.5,
        min_stock_alert: 100,
      })
      fetchMaterials()
    } catch (error) {
      toast.error("Failed to add material", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const handleDeleteMaterial = async (materialId: string) => {
    try {
      // Check if there are any rolls using this material
      const materialName = materials.find((m) => m.id === materialId)?.name || ""
      const hasRolls = await rollService.existsByMaterialType(materialName)

      if (hasRolls) {
        toast.error("Cannot delete material", {
          description: "This material is being used by existing rolls",
        })
        return
      }

      const hasPOItems = await purchaseOrderService.existsItemsByMaterialType(materialId)
      if (hasPOItems) {
        toast.error("Cannot delete material", {
          description: "This material is referenced by existing purchase orders",
        })
        return
      }

      await materialTypeService.delete(materialId)
      toast.success("Material deleted successfully")
      setDeleteMaterialDialog(null)
      fetchMaterials()
    } catch (error) {
      const isFkError =
        typeof error === "object" &&
        error !== null &&
        (("code" in error && (error as { code?: string }).code === "23503") ||
          ((error as { message?: string }).message?.includes("foreign key constraint") ?? false))
      toast.error("Failed to delete material", {
        description: isFkError
          ? "This material is referenced by other records and cannot be deleted"
          : error instanceof Error
            ? error.message
            : undefined,
      })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">Material Settings</h1>
          <p className="text-muted-foreground">Configure material types and stock thresholds</p>
        </div>
        <div className="text-center py-8 text-muted-foreground">Loading materials...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Material Settings</h1>
          <p className="text-muted-foreground">Configure material types and stock thresholds</p>
        </div>
        <Button onClick={() => setNewMaterialDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Material Type
        </Button>
      </div>

      <MaterialConfigList
        materials={materials}
        editedValues={editedValues}
        onValueChange={handleValueChange}
        onSave={handleSave}
        onDeleteClick={(id) => setDeleteMaterialDialog(id)}
      />

      <MaterialDialogs
        newMaterialDialog={newMaterialDialog}
        onNewMaterialDialogChange={setNewMaterialDialog}
        newMaterial={newMaterial}
        onNewMaterialChange={setNewMaterial}
        onAddMaterial={handleAddMaterial}
        deleteMaterialDialog={deleteMaterialDialog}
        onDeleteMaterialDialogChange={setDeleteMaterialDialog}
        onDeleteMaterial={handleDeleteMaterial}
      />
    </div>
  )
}
