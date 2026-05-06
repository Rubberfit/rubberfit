import * as React from "react"

import { Button } from "@/app/components/ui/button"
import { cn } from "@/app/lib/utils"

export interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Save button label. Defaults to "Save". */
  saveLabel?: React.ReactNode
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: React.ReactNode
  /** Click handler for the primary save button. */
  onSave?: () => void
  /** Click handler for the secondary cancel button. */
  onCancel?: () => void
  /** Disable the save button (e.g., no dirty changes, validation pending). */
  saveDisabled?: boolean
  /** Render a small loading spinner inside Save and disable both buttons. */
  isSaving?: boolean
  /** Optional saved-state caption shown left-aligned (e.g., "Last saved 2m ago"). */
  savedHint?: React.ReactNode
  /** `type` for the save button — set to "submit" when nesting inside a `<form>`. Defaults to `button`. */
  saveType?: "button" | "submit"
}

/**
 * Per-section Save / Cancel row used by Settings sub-pages. Renders
 * the saved-state hint left, action buttons right. See
 * `docs/superpowers/specs/2026-05-06-dashboard-phase2-design.md` §3.5.
 */
export function FormActions({
  saveLabel = "Save",
  cancelLabel = "Cancel",
  onSave,
  onCancel,
  saveDisabled,
  isSaving,
  savedHint,
  saveType = "button",
  className,
  ...props
}: FormActionsProps) {
  return (
    <div
      data-slot="form-actions"
      className={cn("flex items-center justify-between gap-4 pt-6", className)}
      {...props}
    >
      <p
        aria-live="polite"
        className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
      >
        {savedHint ?? null}
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
          {cancelLabel}
        </Button>
        <Button
          type={saveType}
          variant="default"
          onClick={onSave}
          disabled={saveDisabled || isSaving}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}
