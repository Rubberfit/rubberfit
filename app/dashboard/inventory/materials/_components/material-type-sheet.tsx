"use client"

import { ChevronLeft, X } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { Textarea } from "@/app/components/ui/textarea"

interface MaterialTypeForm {
  name: string
  description: string
  min_stock_alert: string
}

interface MaterialTypeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isEditing: boolean
  formData: MaterialTypeForm
  onFormDataChange: (data: MaterialTypeForm) => void
  onSubmit: () => void
  submitting: boolean
}

/**
 * Material type editor — Phase 3 PR 3g.
 *
 * Right-docked `<Sheet>` replacement for the previous centered
 * `MaterialTypeDialog`. Header/footer chrome and width
 * (`sm:max-w-2xl`) match `PoEditDrawerBody` (PR #199) and
 * `ReorderRuleSheet` (PR #201) so all inventory edit surfaces share
 * one drawer pattern. The form is intentionally compact (3 fields)
 * so the sheet width is locked at the system default — no narrower
 * variant per Kimi's directive.
 */
export function MaterialTypeSheet({
  open,
  onOpenChange,
  isEditing,
  formData,
  onFormDataChange,
  onSubmit,
  submitting,
}: MaterialTypeSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="font-display text-base font-semibold tracking-tight">
                {isEditing ? "Edit material type" : "Add material type"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Name the material, set a description, and pick a low-stock alert threshold.
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            // Re-entry guard — `submitting` already disables the
            // submit button, but the implicit-submit path (Enter
            // in any input) bypasses the disabled state. The
            // parent's submit handler is async, so without this
            // guard a quick Enter+Enter could fire two requests.
            if (submitting) return
            onSubmit()
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
            <div className="grid gap-2">
              <Label htmlFor="material-name">Name *</Label>
              <Input
                id="material-name"
                value={formData.name}
                onChange={(e) => onFormDataChange({ ...formData, name: e.target.value })}
                placeholder="e.g., Neoprene, EPDM, Silicone"
                required
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="material-description">Description</Label>
              <Textarea
                id="material-description"
                value={formData.description}
                onChange={(e) => onFormDataChange({ ...formData, description: e.target.value })}
                placeholder="Material properties and characteristics"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="material-min-stock">Low-stock alert (sq ft)</Label>
              <Input
                id="material-min-stock"
                type="number"
                step="1"
                min="0"
                value={formData.min_stock_alert}
                onChange={(e) => onFormDataChange({ ...formData, min_stock_alert: e.target.value })}
                placeholder="100"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEditing ? "Save changes" : "Create type"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
