"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

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

interface RegionalState {
  defaultCurrency: string
  timeZone: string
  dateFormat: string
}

const DEFAULTS: RegionalState = {
  defaultCurrency: "USD",
  timeZone: "America/Chicago",
  dateFormat: "MM/dd/yyyy",
}

export function RegionalSection() {
  const [baseline, setBaseline] = useState<RegionalState>(DEFAULTS)
  const [draft, setDraft] = useState<RegionalState>(DEFAULTS)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const isDirty =
    draft.defaultCurrency !== baseline.defaultCurrency ||
    draft.timeZone !== baseline.timeZone ||
    draft.dateFormat !== baseline.dateFormat

  const handleSave = useCallback(() => {
    setBaseline(draft)
    setSavedAt(Date.now())
    toast.success("Regional defaults saved")
  }, [draft])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset>
      <FormSectionHeader
        eyebrow="Regional"
        title="Regional defaults"
        description="Currency, time zone, and date format used across the dashboard."
      />
      <div className="mt-6 space-y-5">
        <FormFieldGroup>
          <FormFieldRow>
            <FormField label="Default currency" htmlFor="default-currency">
              <Select
                value={draft.defaultCurrency}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, defaultCurrency: value }))}
              >
                <SelectTrigger id="default-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="EUR">EUR — Euro</SelectItem>
                  <SelectItem value="GBP">GBP — British Pound</SelectItem>
                  <SelectItem value="CAD">CAD — Canadian Dollar</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Time zone" htmlFor="time-zone">
              <Select
                value={draft.timeZone}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, timeZone: value }))}
              >
                <SelectTrigger id="time-zone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </FormFieldRow>
          <FormField label="Date format" htmlFor="date-format">
            <Select
              value={draft.dateFormat}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, dateFormat: value }))}
            >
              <SelectTrigger id="date-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
                <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
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
