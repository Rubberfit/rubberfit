"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { format } from "date-fns"
import { toast } from "sonner"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { Form } from "@/app/components/ui/form"
import { Button } from "@/app/components/ui/button"
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

import {
  materialTypes as materialTypesSdk,
  rolls as rollsSdk,
} from "@/src/infrastructure/api-client/rf/inventory"
import type { Roll, MaterialType } from "@/src/infrastructure/models/supabase"
import { ensureStoredRollBarcode } from "@/src/infrastructure/services/rollBarcodeAssetService"

import { RollFormFields } from "./roll-form-fields"
import { rollFormSchema, type RollFormValues } from "./roll-form-schema"

interface RollFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  roll: Roll | null
  onSuccess?: () => void
}

interface DirtyHandle {
  /** Returns the current `isDirty` flag from the inner RHF form. */
  isDirty: () => boolean
}

// Default cost per sqft when the user hasn't entered one. Pulled
// from the legacy form where it lived as a magic number; kept as
// a single source of truth so a future workspace-level default
// flows into both the empty-form path and the edit-fallback path.
const DEFAULT_COST_PER_SQFT = 2.5

function getTargetKey(roll: Roll | null): string {
  return roll === null ? "new" : roll.id
}

function buildDefaultValues(): RollFormValues {
  return {
    material_type: "",
    width: 0,
    length: 0,
    thickness: 0,
    color: "",
    location: "",
    date_received: format(new Date(), "yyyy-MM-dd"),
    supplier: "",
    cost_per_sqft: DEFAULT_COST_PER_SQFT,
    notes: "",
    remaining_length: undefined,
  }
}

function buildEditValues(roll: Roll): RollFormValues {
  return {
    material_type: roll.material_type,
    width: roll.width,
    length: roll.length,
    thickness: roll.thickness,
    color: roll.color ?? "",
    location: roll.location ?? "",
    // Date-only strings (YYYY-MM-DD) parse as UTC midnight via `new
    // Date(...)`, which shifts to the previous local day in negative
    // UTC offsets. Take the first 10 chars directly when the value
    // already looks date-only; only fall through to Date for full
    // timestamps (legacy rows).
    date_received: roll.date_received
      ? /^\d{4}-\d{2}-\d{2}/.test(roll.date_received)
        ? roll.date_received.slice(0, 10)
        : format(new Date(roll.date_received), "yyyy-MM-dd")
      : format(new Date(), "yyyy-MM-dd"),
    supplier: roll.supplier ?? "",
    cost_per_sqft: roll.cost_per_sqft ?? DEFAULT_COST_PER_SQFT,
    notes: roll.notes ?? "",
    remaining_length: roll.remaining_length,
  }
}

/**
 * Right-side `<Sheet>` for create + edit roll. Phase 3 PR 3b
 * replaces the centered `<Dialog>` (`roll-form-dialog.tsx`,
 * deleted in this PR). Body is keyed on target identity so the
 * RHF form re-mounts fresh per roll without setState-in-effect
 * resets.
 *
 * Dirty guard: outside-click and Escape consult an `isDirty`
 * snapshot exposed by the body via a ref. If clean, the sheet
 * closes immediately. If dirty, an `<AlertDialog>` confirms
 * before discarding.
 */
export function RollFormSheet({ open, onOpenChange, roll, onSuccess }: RollFormSheetProps) {
  const dirtyRef = useRef<DirtyHandle | null>(null)
  const [showGuard, setShowGuard] = useState(false)

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && open && dirtyRef.current?.isDirty()) {
        setShowGuard(true)
        return
      }
      onOpenChange(nextOpen)
    },
    [open, onOpenChange]
  )

  const handleConfirmDiscard = useCallback(() => {
    setShowGuard(false)
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-xl">
          <RollFormBody
            key={getTargetKey(roll)}
            roll={roll}
            dirtyRef={dirtyRef}
            onSuccess={onSuccess}
            // Route Cancel through the dirty-guard path so the user
            // can't bypass the confirm by clicking the inner button.
            // Submit success uses `onSubmitClose` below to bypass
            // the guard intentionally (the form just saved).
            onClose={() => handleOpenChange(false)}
            onSubmitClose={() => onOpenChange(false)}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={showGuard} onOpenChange={setShowGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Discard them and close the form?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface RollFormBodyProps {
  roll: Roll | null
  dirtyRef: React.MutableRefObject<DirtyHandle | null>
  onSuccess?: () => void
  /**
   * Inner-Cancel close request — routes through the parent's
   * `handleOpenChange` so the dirty guard runs the same way it
   * does for outside-clicks and Escape.
   */
  onClose: () => void
  /**
   * Post-submit close that intentionally bypasses the dirty
   * guard — the form just persisted, so `isDirty` going from
   * true→false during reset shouldn't trigger the discard prompt.
   */
  onSubmitClose: () => void
}

function RollFormBody({ roll, dirtyRef, onSuccess, onClose, onSubmitClose }: RollFormBodyProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const isEdit = roll !== null

  const form = useForm<RollFormValues>({
    resolver: zodResolver(rollFormSchema),
    defaultValues: isEdit ? buildEditValues(roll) : buildDefaultValues(),
  })

  // Wire the parent's dirty handle. Updates per render so the
  // closure reads `form.formState.isDirty` lazily at close time.
  dirtyRef.current = {
    isDirty: () => form.formState.isDirty,
  }

  useEffect(() => {
    return () => {
      dirtyRef.current = null
    }
  }, [dirtyRef])

  useEffect(() => {
    let isCancelled = false
    materialTypesSdk
      .list()
      .then((types) => {
        if (isCancelled) return
        setMaterialTypes(types)
      })
      .catch((error) => {
        if (isCancelled) return
        console.error("Error fetching material types:", error)
        toast.error("Failed to load material types")
      })
    return () => {
      isCancelled = true
    }
  }, [])

  const onSubmit = async (values: RollFormValues) => {
    setIsSaving(true)
    try {
      // The Rust API requires `material_type_id` (UUID), not the
      // denormalized name. The legacy path accepts the name
      // directly. The SDK wrapper handles both — on v2 it forwards
      // `material_type_id`; on the legacy fallback it forwards the
      // name alongside. Look up the id from the current material-
      // types list and pass BOTH where the API supports it.
      const matchedType = materialTypes.find((m) => m.name === values.material_type)
      const materialTypeId = matchedType?.id

      let savedRoll: Roll

      if (isEdit && roll) {
        savedRoll = await rollsSdk.update(roll.id, {
          ...values,
          ...(materialTypeId ? { material_type_id: materialTypeId } : {}),
          remaining_length: values.remaining_length ?? values.length,
        })
      } else {
        if (!materialTypeId) {
          throw new Error("Select a material type from the dropdown (unknown name)")
        }
        savedRoll = await rollsSdk.create({
          material_type_id: materialTypeId,
          width: values.width,
          length: values.length,
          thickness: values.thickness,
          color: values.color,
          location: values.location,
          date_received: values.date_received,
          supplier: values.supplier,
          cost_per_sqft: values.cost_per_sqft,
          remaining_length: values.length,
          status: "active",
          notes: values.notes,
        })
      }

      let barcodeStorageError: string | null = null
      try {
        await ensureStoredRollBarcode(savedRoll)
      } catch (error) {
        barcodeStorageError =
          error instanceof Error ? error.message : "Unknown barcode storage error"
      }

      if (barcodeStorageError) {
        toast.error("Roll saved, but barcode storage failed", {
          description: barcodeStorageError,
        })
      } else {
        toast.success(isEdit ? "Roll updated successfully" : "Roll added successfully")
      }

      onSuccess?.()
      form.reset()
      onSubmitClose()
    } catch (error) {
      console.error("Error saving roll:", error)
      toast.error(isEdit ? "Failed to update roll" : "Failed to add roll", {
        description: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex h-full flex-col">
        <SheetHeader className="shrink-0 space-y-2 border-b px-6 pt-6 pb-4">
          <SheetTitle className="font-semibold text-base tracking-tight">
            {isEdit ? "Edit Roll" : "Add New Roll"}
          </SheetTitle>
          <SheetDescription className="text-muted-foreground text-xs">
            {isEdit
              ? "Update the details of this roll."
              : "Enter the details of the new roll to add to inventory."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <RollFormFields form={form} materialTypes={materialTypes} isEdit={isEdit} />
        </div>

        <div className="shrink-0 border-t bg-card px-6 py-4">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (isEdit ? "Updating…" : "Adding…") : isEdit ? "Update roll" : "Add roll"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
