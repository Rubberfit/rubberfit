"use client"

import { memo } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { Checkbox } from "@/app/components/ui/checkbox"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"

import { PoReceiveRollFields } from "./po-receive-roll-fields"
import type { ItemDraft, RollDataDraft } from "./use-po-receive-form"

interface PoReceiveItemRowProps {
  draft: ItemDraft
  error: string | null
  onChange: (itemId: string, patch: Partial<ItemDraft>) => void
  onChangeRollData: (itemId: string, patch: Partial<RollDataDraft>) => void
}

/**
 * One row in the Receive PO dialog's receivable section. Memo'd so
 * one row's keystroke doesn't redraw siblings. Reads only its own
 * slice of the drafts map via props.
 */
function PoReceiveItemRowInner({
  draft,
  error,
  onChange,
  onChangeRollData,
}: PoReceiveItemRowProps) {
  const outstanding = Math.max(0, draft.quantitySqft - draft.alreadyReceivedSqft)
  const ExpandIcon = draft.rollDataExpanded ? ChevronDown : ChevronRight

  function handleEnabledChange(value: boolean | "indeterminate") {
    onChange(draft.itemId, { enabled: value === true })
  }
  function handleQtyChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(draft.itemId, { quantityReceived: e.target.value })
  }
  function handleExpandClick() {
    onChange(draft.itemId, { rollDataExpanded: !draft.rollDataExpanded })
  }

  return (
    <div
      data-testid={`po-receive-item-${draft.itemId}`}
      className={`rounded-lg border p-4 ${draft.enabled ? "bg-card" : "bg-muted/40 opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={`${draft.itemId}-enabled`}
          checked={draft.enabled}
          onCheckedChange={handleEnabledChange}
          aria-label={`Include ${draft.materialName} in this receipt`}
          className="mt-1"
        />
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Label
              htmlFor={`${draft.itemId}-enabled`}
              className="text-sm font-medium text-foreground"
            >
              {draft.materialName}
            </Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              Ordered {draft.quantitySqft} sqft · Received {draft.alreadyReceivedSqft} sqft ·
              Outstanding {outstanding} sqft
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor={`${draft.itemId}-qty`} className="text-xs text-muted-foreground">
                Receiving (sqft)
              </Label>
              <Input
                id={`${draft.itemId}-qty`}
                type="number"
                min={0}
                max={outstanding}
                step="0.01"
                value={draft.quantityReceived}
                onChange={handleQtyChange}
                disabled={!draft.enabled}
                aria-invalid={error !== null}
              />
              {error && (
                <p
                  data-testid={`po-receive-item-error-${draft.itemId}`}
                  className="text-xs text-danger-foreground"
                >
                  {error}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExpandClick}
              disabled={!draft.enabled}
              className="justify-self-start"
            >
              <ExpandIcon className="size-3.5" aria-hidden="true" />
              {draft.rollDataExpanded ? "Hide roll details" : "Add roll details"}
            </Button>
          </div>
          {draft.rollDataExpanded && draft.enabled && (
            <PoReceiveRollFields
              itemId={draft.itemId}
              rollData={draft.rollData}
              defaultWidth={draft.defaultWidth}
              defaultThickness={draft.defaultThickness}
              defaultColor={draft.defaultColor}
              onChange={onChangeRollData}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export const PoReceiveItemRow = memo(PoReceiveItemRowInner)
