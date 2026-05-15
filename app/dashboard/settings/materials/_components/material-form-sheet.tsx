"use client"

import { useEffect, useRef, useState } from "react"

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
import { FormField, FormFieldGroup, FormFieldRow } from "@/app/components/ui/forms"
import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import { type MaterialType } from "@/src/infrastructure/models/supabase"

export interface MaterialFormValues {
  name: string
  description: string
  default_cost: number
  min_stock_alert: number
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

function initialValuesFor(
  target: MaterialType | "new",
  newMaterialThresholdSeed: number
): MaterialFormValues {
  if (target === "new") {
    // Seed the new-material min_stock_alert from the org's
    // `lowStockThresholdSqft` so admins see the workspace default
    // pre-filled. Operator can override before saving; an explicit
    // server-side seed still applies for callers that omit the field
    // entirely (CSV import, legacy SDK paths). 2026-05-14 ruling.
    return {
      name: "",
      description: "",
      default_cost: 2.5,
      min_stock_alert: newMaterialThresholdSeed,
    }
  }
  return {
    name: target.name ?? "",
    description: target.description ?? "",
    default_cost: target.default_cost ?? 0,
    min_stock_alert: target.min_stock_alert ?? 0,
  }
}

function MaterialFormBody({ target, isSaving, onCancel, onSubmit }: MaterialFormBodyProps) {
  const orgPreferences = useOrganizationPreferences()
  // Track whether the operator has touched the min-stock field so a
  // late org-prefs update (admin saved in another tab → provider
  // re-syncs via router.refresh()) re-seeds the placeholder without
  // clobbering in-flight user input. Sigilix PR #269 catch.
  //
  // Ref lifecycle: the body unmounts on every sheet close
  // (`{target === null ? null : <MaterialFormBody key={formKey} ...>}`
  // in the parent), so the ref recreates as `false` on each reopen —
  // no manual reset needed.
  const minStockAlertTouchedRef = useRef(false)
  const [values, setValues] = useState<MaterialFormValues>(() =>
    initialValuesFor(target, orgPreferences.lowStockThresholdSqft)
  )

  useEffect(() => {
    if (target !== "new" || minStockAlertTouchedRef.current) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded by target check + touch ref; only re-syncs an untouched seed
    setValues((prev) => ({
      ...prev,
      min_stock_alert: orgPreferences.lowStockThresholdSqft,
    }))
  }, [target, orgPreferences.lowStockThresholdSqft])
  const isEdit = target !== "new"
  const isValid = values.name.trim().length > 0

  const handleSubmit = async () => {
    if (!isValid) return
    await onSubmit(values, target)
  }

  const handleMinStockAlertChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    minStockAlertTouchedRef.current = true
    setValues((prev) => ({
      ...prev,
      min_stock_alert: Math.max(0, Number.parseFloat(event.target.value) || 0),
    }))
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
            ? "Update the stock alert level and default cost for this material type."
            : "Create a new material type. Stock alerts and default cost are applied to new rolls."}
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
          <FormFieldRow>
            <FormField
              label="Min stock alert"
              htmlFor="material-stock"
              helperText="Alert fires when stock drops below this level (sq ft)."
            >
              <Input
                id="material-stock"
                type="number"
                inputMode="numeric"
                min="0"
                step="10"
                value={values.min_stock_alert}
                onChange={handleMinStockAlertChange}
              />
            </FormField>
            <FormField
              label="Default cost"
              htmlFor="material-cost"
              helperText="Per sq ft, applied when adding new rolls."
            >
              <Input
                id="material-cost"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={values.default_cost}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    default_cost: Math.max(0, Number.parseFloat(event.target.value) || 0),
                  }))
                }
              />
            </FormField>
          </FormFieldRow>
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
