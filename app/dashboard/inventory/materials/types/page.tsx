"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Upload, ChevronDown } from "lucide-react"

import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypes as materialTypesSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { rollService } from "@/src/infrastructure/services/rollService"
import { existsActiveItemsByMaterialTypeAction } from "@/app/actions/purchase-orders"
import { Button } from "@/app/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { toast } from "sonner"

import { PageHeader, PageShell } from "@/app/components/patterns"
import { Card } from "@/app/components/ui/card"

import { MaterialImportDialog } from "../_components/material-import-dialog"
import { MaterialTypeSheet } from "../_components/material-type-sheet"
import { MaterialTypesTable } from "../_components/material-types-table"

interface MaterialTypeForm {
  name: string
  description: string
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
    min_stock_alert: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [deleteAlertOpen, setDeleteAlertOpen] = useState(false)
  const [materialToDelete, setMaterialToDelete] = useState<MaterialType | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)

  const existingNameSet = useMemo(() => new Set(materialTypes.map((m) => m.name)), [materialTypes])

  const fetchMaterialTypes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await materialTypesSdk.list()
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
      min_stock_alert: "",
    })
    setDialogOpen(true)
  }

  const openEditDialog = (materialType: MaterialType) => {
    setEditingType(materialType)
    setFormData({
      name: materialType.name,
      description: materialType.description || "",
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
      const trimmedDescription = formData.description.trim()
      const parsedStock = formData.min_stock_alert
        ? parseFloat(formData.min_stock_alert)
        : undefined

      if (editingType) {
        await materialTypesSdk.update(editingType.id, {
          name: formData.name.trim(),
          description: trimmedDescription || null,
          min_stock_alert: parsedStock ?? null,
        })
        toast.success("Material type updated successfully")
      } else {
        await materialTypesSdk.create({
          name: formData.name.trim(),
          description: trimmedDescription || undefined,
          min_stock_alert: parsedStock,
        })
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

  const handleDeleteClick = (materialType: MaterialType) => {
    setMaterialToDelete(materialType)
    setDeleteAlertOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!materialToDelete) return

    setDeleting(true)
    try {
      const hasRolls = await rollService.existsByMaterialType(materialToDelete.name)
      if (hasRolls) {
        toast.error("Cannot delete material type", {
          description: "This material is being used by existing rolls",
        })
        return
      }

      const hasPOItems = await existsActiveItemsByMaterialTypeAction(materialToDelete.id)
      if (hasPOItems) {
        toast.error("Cannot delete material type", {
          description: "This material is referenced by existing purchase orders",
        })
        return
      }

      await materialTypesSdk.delete(materialToDelete.id)
      toast.success("Material type deleted successfully")
      fetchMaterialTypes()
    } catch (error) {
      const errCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: string }).code
          : undefined
      const isFkError =
        errCode === "23503" ||
        errCode === "FK_VIOLATION_ROLLS_EXIST" ||
        ((error as { message?: string }).message?.includes("foreign key constraint") ?? false)
      toast.error(
        isFkError
          ? "This material is referenced by other records and cannot be deleted"
          : error instanceof Error
            ? error.message
            : "Failed to delete material type"
      )
    } finally {
      setDeleting(false)
      setDeleteAlertOpen(false)
      setMaterialToDelete(null)
    }
  }

  useEffect(() => {
    fetchMaterialTypes()
  }, [fetchMaterialTypes])

  return (
    <PageShell variant="overview">
      <PageHeader
        crumbs={[
          { label: "Operations", href: "/dashboard" },
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Materials", href: "/dashboard/inventory/materials" },
          { label: "Types" },
        ]}
        title="Material Types"
        subtitle="Rubber categories, durometers, minimum stock alerts."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="size-3.5" />
                Add material
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={openAddDialog}>
                <Plus className="size-3.5" />
                Add manually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                <Upload className="size-3.5" />
                Import CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <Card className="p-0">
        <MaterialTypesTable
          materialTypes={materialTypes}
          loading={loading}
          onEdit={openEditDialog}
          onDelete={handleDeleteClick}
        />
      </Card>

      <MaterialTypeSheet
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEditing={!!editingType}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleSubmit}
        submitting={submitting}
      />

      <AlertDialog open={deleteAlertOpen} onOpenChange={setDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete material type?</AlertDialogTitle>
            <AlertDialogDescription>
              {materialToDelete ? (
                <>
                  This will permanently delete{" "}
                  <span className="font-semibold">{materialToDelete.name}</span>. This action cannot
                  be undone.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleDeleteConfirm()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MaterialImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        existingNames={existingNameSet}
        onImportComplete={fetchMaterialTypes}
      />
    </PageShell>
  )
}
