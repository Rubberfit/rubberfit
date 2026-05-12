"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { PageHeader, PageShell } from "@/app/components/patterns"
import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { createMaterialType, deleteMaterialType, updateMaterialType } from "@/app/actions/materials"

import { MaterialDeleteDialog } from "./_components/material-delete-dialog"
import { MaterialFormSheet, type MaterialFormValues } from "./_components/material-form-sheet"
import { MaterialTable } from "./_components/material-table"

/**
 * Material settings — Phase 2 PR 3.
 *
 * Shared catalog table (`<DataTable>`) with a right-side `<Sheet>`
 * drawer for Add / Edit and a destructive `<AlertDialog>` for
 * deletion. Writes flow through `manageMaterialTypes`-gated server
 * actions in `app/actions/materials.ts`; reads still go directly
 * through `materialTypeService.getAll()` (cached, RLS-respecting,
 * no auth/permission gate needed for catalog lookups).
 *
 * `deleteMaterialType` returns a discriminated union with stable
 * `reason` codes for the UI to surface specific FK messages
 * (rolls / purchase orders). Pre-flight checks live server-side.
 *
 * See `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §4.
 */
export default function MaterialSettingsPage() {
  const [materials, setMaterials] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<MaterialType | "new" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MaterialType | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true)
      const data = await materialTypeService.getAll()
      setMaterials(data)
    } catch (error) {
      toast.error("Failed to load materials", {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMaterials()
  }, [fetchMaterials])

  const handleSubmitForm = useCallback(
    async (values: MaterialFormValues, target: MaterialType | "new") => {
      setIsSaving(true)
      try {
        if (target === "new") {
          await createMaterialType({
            name: values.name.trim(),
            description: values.description.trim(),
            default_cost: values.default_cost,
            min_stock_alert: values.min_stock_alert,
          })
          toast.success("Material added")
        } else {
          await updateMaterialType({
            id: target.id,
            name: values.name.trim(),
            description: values.description.trim(),
            default_cost: values.default_cost,
            min_stock_alert: values.min_stock_alert,
          })
          toast.success("Material updated")
        }
        setEditTarget(null)
        await fetchMaterials()
      } catch (error) {
        toast.error(target === "new" ? "Failed to add material" : "Failed to update material", {
          description: error instanceof Error ? error.message : undefined,
        })
      } finally {
        setIsSaving(false)
      }
    },
    [fetchMaterials]
  )

  const handleConfirmDelete = useCallback(
    async (material: MaterialType) => {
      try {
        const result = await deleteMaterialType({ id: material.id })
        if (!result.ok) {
          toast.error("Cannot delete material", { description: result.message })
          return
        }
        toast.success("Material deleted")
        setDeleteTarget(null)
        await fetchMaterials()
      } catch (error) {
        // Auth / permission / unexpected runtime errors propagate as throws.
        toast.error("Failed to delete material", {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [fetchMaterials]
  )

  return (
    // Body is a DataTable (Name + Min stock + Default cost +
    // actions), not a settings form, so the 760px `form` variant
    // clipped the rightmost columns and forced a horizontal scroll.
    // Bumping to `dense` (1800px) matches the inventory list +
    // suppliers + admin/security pattern where the same chrome
    // lives. Carry-over from PR #198's polish round.
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Settings", href: "/dashboard/settings" }, { label: "Materials" }]}
        title="Materials"
        subtitle="Material types in the catalog. Stock alerts and default cost apply when adding new rolls."
        actions={
          <Button size="sm" onClick={() => setEditTarget("new")}>
            <Plus className="size-3.5" aria-hidden="true" />
            Add material
          </Button>
        }
      />

      <MaterialTable
        materials={materials}
        isLoading={loading}
        onEdit={(row) => setEditTarget(row)}
        onDelete={(row) => setDeleteTarget(row)}
        onAddNew={() => setEditTarget("new")}
      />

      <MaterialFormSheet
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleSubmitForm}
        isSaving={isSaving}
      />

      <MaterialDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </PageShell>
  )
}
