"use client"

import { useState } from "react"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { FormField, FormFieldGroup } from "@/app/components/ui/forms"
import { type MaterialType } from "@/src/entities/material-type"

export interface MaterialFormValues {
  name: string
  description: string
  min_stock_sqm: number
}

const EMPTY_VALUES: MaterialFormValues = {
  name: "",
  description: "",
  min_stock_sqm: 10,
}

interface MaterialFormSheetProps {
  /** When set, the drawer opens in "edit" mode populated with the row. Null = closed; "new" = add a new material. */
  target: MaterialType | "new" | null
  onClose: () => void
  onSubmit: (values: MaterialFormValues, target: MaterialType | "new") => Promise<void> | void
  isSaving: boolean
}

/**
 * Right-side drawer for adding or editing a material type. Per the
 * Phase 2 spec §4 Materials section, this replaces the prior
 * `<Dialog>`-based add flow because operators add material rows in
 * succession and benefit from the catalog staying visible behind
 * the drawer.
 *
 * `MaterialFormBody` is keyed on the target identity so it
 * remounts (and re-initializes its draft state) every time the
 * caller switches between Add and Edit, or between two different
 * Edit rows. That avoids the React-19-flagged "setState inside
 * effect" pattern of resetting on prop change.
 */
export function MaterialFormSheet({ target, onClose, onSubmit, isSaving }: MaterialFormSheetProps) {
  const formKey = target === null ? "closed" : target === "new" ? "new" : `edit-${target.id}`

  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-full p-0 sm:max-w-md md:max-w-[520px]"
        onInteractOutside={(event) => {
          if (isSaving) event.preventDefault()
        }}
      >
        {target === null ? null : (
          <MaterialFormBody
            key={formKey}
            target={target}
            isSaving={isSaving}
            onCancel={onClose}
            onSubmit={onSubmit}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

interface MaterialFormBodyProps {
  target: MaterialType | "new"
  isSaving: boolean
  onCancel: () => void
  onSubmit: (values: MaterialFormValues, target: MaterialType | "new") => Promise<void> | void
}

function initialValuesFor(target: MaterialType | "new"): MaterialFormValues {
  if (target === "new") return EMPTY_VALUES
  return {
    name: target.name ?? "",
    description: target.description ?? "",
    min_stock_sqm: target.minStockSqm ?? 0,
  }
}

function MaterialFormBody({ target, isSaving, onCancel, onSubmit }: MaterialFormBodyProps) {
  const [values, setValues] = useState<MaterialFormValues>(() => initialValuesFor(target))
  const isEdit = target !== "new"
  const isValid = values.name.trim().length > 0

  const handleSubmit = async () => {
    if (!isValid) return
    await onSubmit(values, target)
  }

  return (
    <>
      <SheetHeader className="border-b border-border-subtle px-6 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          Materials
        </p>
        <SheetTitle className="font-display text-lg font-semibold tracking-tight">
          {isEdit ? "Edit material" : "New material"}
        </SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">
          {isEdit
            ? "Update the stock alert level for this material type."
            : "Create a new material type. Stock alerts trigger when inventory drops below the threshold."}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <FormFieldGroup>
          <FormField label="Name" htmlFor="material-name" required>
            <Input
              id="material-name"
              value={values.name}
              onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g., Neoprene"
              autoFocus={!isEdit}
            />
          </FormField>
          <FormField
            label="Description"
            htmlFor="material-description"
            helperText="Optional. Shown next to the name in the catalog."
          >
            <Textarea
              id="material-description"
              value={values.description}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="e.g., General-purpose synthetic rubber."
            />
          </FormField>
          <FormField
            label="Min stock alert"
            htmlFor="material-stock"
            helperText="Alert fires when stock drops below this level (sqm)."
          >
            <Input
              id="material-stock"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={values.min_stock_sqm}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  min_stock_sqm: Math.max(0, Number.parseFloat(event.target.value) || 0),
                }))
              }
            />
          </FormField>
        </FormFieldGroup>
      </div>

      <SheetFooter className="flex-row items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
        <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
          {isSaving ? "Saving…" : isEdit ? "Save changes" : "Add material"}
        </Button>
      </SheetFooter>
    </>
  )
}
