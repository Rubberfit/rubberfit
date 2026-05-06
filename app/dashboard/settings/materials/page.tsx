"use client"

import { useCallback, useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { PageHeader, PageShell } from "@/app/components/patterns"
import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { rollService } from "@/src/infrastructure/services/rollService"
import { purchaseOrderService } from "@/src/infrastructure/services/purchaseOrderService"

import { MaterialDeleteDialog } from "./_components/material-delete-dialog"
import { MaterialFormSheet, type MaterialFormValues } from "./_components/material-form-sheet"
import { MaterialTable } from "./_components/material-table"

/**
 * Material settings — Phase 2 PR 3.
 *
 * Shared catalog table (`<DataTable>`) with a right-side `<Sheet>`
 * drawer for Add / Edit and a destructive `<AlertDialog>` for
 * deletion. Wired against `materialTypeService` (Supabase) — same
 * service paths used in S4 Task 10's card-per-row layout, only
 * the chrome moves to the Phase 2 primitives.
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
          await materialTypeService.create({
            name: values.name.trim(),
            description: values.description.trim(),
            default_cost: values.default_cost,
            min_stock_alert: values.min_stock_alert,
          })
          toast.success("Material added")
        } else {
          await materialTypeService.update(target.id, {
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
        // Asymmetric lookup: `rolls` stores `material_type` as a name string
        // (legacy schema), while `purchase_order_items` uses a proper FK to
        // the material id. Future schema-normalization pass tracked in the
        // S6 tech-debt list.
        const hasRolls = await rollService.existsByMaterialType(material.name)
        if (hasRolls) {
          toast.error("Cannot delete material", {
            description: "This material is being used by existing rolls.",
          })
          return
        }

        const hasPOItems = await purchaseOrderService.existsItemsByMaterialType(material.id)
        if (hasPOItems) {
          toast.error("Cannot delete material", {
            description: "This material is referenced by existing purchase orders.",
          })
          return
        }

        await materialTypeService.delete(material.id)
        toast.success("Material deleted")
        setDeleteTarget(null)
        await fetchMaterials()
      } catch (error) {
        const isFkError =
          typeof error === "object" &&
          error !== null &&
          (("code" in error && (error as { code?: string }).code === "23503") ||
            ((error as { message?: string }).message?.includes("foreign key constraint") ?? false))
        toast.error("Failed to delete material", {
          description: isFkError
            ? "This material is referenced by other records and cannot be deleted."
            : error instanceof Error
              ? error.message
              : undefined,
        })
      }
    },
    [fetchMaterials]
  )

  return (
    <PageShell variant="form">
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
