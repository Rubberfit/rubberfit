"use client"

import { memo } from "react"

import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import type { RollDataDraft } from "./use-po-receive-form"

interface PoReceiveRollFieldsProps {
  itemId: string
  rollData: RollDataDraft
  defaultWidth: number | null
  defaultThickness: number | null
  defaultColor: string | null
  onChange: (itemId: string, patch: Partial<RollDataDraft>) => void
}

/**
 * Optional rollData inputs that appear under a line item when the
 * operator expands "Add roll details." Values are passed through to
 * the server in imperial units; `po-input-conversion.ts::buildRollIntent`
 * converts to metric on the server side.
 *
 * Placeholders show the PO-item defaults (width / thickness / color)
 * so the operator knows what the server will fall back to if they
 * leave the field blank — empty means "use PO-item default," not
 * "explicit zero."
 */
function PoReceiveRollFieldsInner({
  itemId,
  rollData,
  defaultWidth,
  defaultThickness,
  defaultColor,
  onChange,
}: PoReceiveRollFieldsProps) {
  return (
    <div
      data-testid={`po-receive-roll-fields-${itemId}`}
      className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-4 sm:grid-cols-3"
    >
      <FieldNumeric
        id={`${itemId}-width`}
        label="Width (in)"
        value={rollData.width}
        placeholder={defaultWidth != null ? `Default: ${defaultWidth}` : "—"}
        onChange={(v) => onChange(itemId, { width: v })}
      />
      <FieldNumeric
        id={`${itemId}-length`}
        label="Length (in)"
        value={rollData.length}
        placeholder="—"
        onChange={(v) => onChange(itemId, { length: v })}
      />
      <FieldNumeric
        id={`${itemId}-thickness`}
        label="Thickness (in)"
        value={rollData.thickness}
        placeholder={defaultThickness != null ? `Default: ${defaultThickness}` : "—"}
        onChange={(v) => onChange(itemId, { thickness: v })}
        step="0.001"
      />

      <FieldText
        id={`${itemId}-color`}
        label="Color"
        value={rollData.color}
        placeholder={defaultColor ?? "—"}
        onChange={(v) => onChange(itemId, { color: v })}
      />
      <FieldText
        id={`${itemId}-location`}
        label="Location"
        value={rollData.location}
        placeholder="Receiving"
        onChange={(v) => onChange(itemId, { location: v })}
      />
      <FieldNumeric
        id={`${itemId}-cost`}
        label="Cost ($/sqft)"
        value={rollData.cost_per_sqft}
        placeholder="—"
        onChange={(v) => onChange(itemId, { cost_per_sqft: v })}
        step="0.01"
      />

      <FieldDate
        id={`${itemId}-date`}
        label="Date received"
        value={rollData.date_received}
        onChange={(v) => onChange(itemId, { date_received: v })}
      />
      <FieldText
        id={`${itemId}-notes`}
        label="Notes"
        value={rollData.notes}
        placeholder="—"
        onChange={(v) => onChange(itemId, { notes: v })}
        wrapperClassName="sm:col-span-2"
      />
    </div>
  )
}

export const PoReceiveRollFields = memo(PoReceiveRollFieldsInner)

interface BaseFieldProps {
  id: string
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
  wrapperClassName?: string
}

function FieldNumeric({
  id,
  label,
  value,
  placeholder,
  onChange,
  step = "0.01",
}: BaseFieldProps & { step?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function FieldText({ id, label, value, placeholder, onChange, wrapperClassName }: BaseFieldProps) {
  return (
    <div className={`space-y-1.5 ${wrapperClassName ?? ""}`}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

function FieldDate({ id, label, value, onChange }: BaseFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}
