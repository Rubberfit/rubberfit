"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Input } from "@/app/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"

import { formatSavedHint } from "./format-saved-hint"

interface OperationalState {
  unitSystem: string
  lowStockThreshold: string
}

const DEFAULTS: OperationalState = {
  unitSystem: "imperial",
  lowStockThreshold: "50",
}

export function OperationsSection() {
  const [baseline, setBaseline] = useState<OperationalState>(DEFAULTS)
  const [draft, setDraft] = useState<OperationalState>(DEFAULTS)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const isDirty =
    draft.unitSystem !== baseline.unitSystem ||
    draft.lowStockThreshold !== baseline.lowStockThreshold

  const handleSave = useCallback(() => {
    setBaseline(draft)
    setSavedAt(Date.now())
    toast.success("Operational defaults saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Operations"
        title="Operational defaults"
        description="Default unit system and stock-alert threshold for new materials."
      />
      <div className="mt-6 space-y-5">
        <FormFieldGroup>
          <FormFieldRow>
            <FormField label="Default unit system" htmlFor="unit-system">
              <Select
                value={draft.unitSystem}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, unitSystem: value }))}
              >
                <SelectTrigger id="unit-system">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="imperial">Imperial (in / sq ft)</SelectItem>
                  <SelectItem value="metric">Metric (cm / m²)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Low-stock threshold"
              htmlFor="low-stock-threshold"
              helperText={`Default alert level for new materials, in ${draft.unitSystem === "metric" ? "m²" : "sq ft"}.`}
            >
              <Input
                id="low-stock-threshold"
                type="number"
                inputMode="numeric"
                min="0"
                value={draft.lowStockThreshold}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, lowStockThreshold: event.target.value }))
                }
              />
            </FormField>
          </FormFieldRow>
        </FormFieldGroup>
        <FormActions
          savedHint={formatSavedHint(savedAt)}
          saveDisabled={!isDirty}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    </FormFieldset>
  )
}
