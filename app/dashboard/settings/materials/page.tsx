"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/app/components/ui/button"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { rollService } from "@/src/infrastructure/services/rollService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

import { PageHeader, PageShell } from "@/app/components/patterns"

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

  return (
    <PageShell variant="form">
      <PageHeader
        crumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Materials" },
        ]}
        title="Material settings"
        subtitle="Configure material types and stock thresholds."
        actions={
          <Button size="sm" onClick={() => setNewMaterialDialog(true)}>
            <Plus className="size-3.5" />
            Add material type
          </Button>
        }
      />

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">Loading materials…</div>
      ) : (
        <MaterialConfigList
          materials={materials}
          editedValues={editedValues}
          onValueChange={handleValueChange}
          onSave={handleSave}
          onDeleteClick={(id) => setDeleteMaterialDialog(id)}
        />
      )}

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
    </PageShell>
  )
}
