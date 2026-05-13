"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"

import { Input } from "@/app/components/ui/input"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"

import { formatSavedHint } from "./format-saved-hint"

interface OrganizationState {
  companyName: string
  legalName: string
}

const DEFAULTS: OrganizationState = {
  companyName: "Arc & Anchor",
  legalName: "",
}

export function OrganizationSection({ isFirst = false }: { isFirst?: boolean }) {
  const [baseline, setBaseline] = useState<OrganizationState>(DEFAULTS)
  const [draft, setDraft] = useState<OrganizationState>(DEFAULTS)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const isValid = draft.companyName.trim().length > 0
  const isDirty =
    draft.companyName !== baseline.companyName || draft.legalName !== baseline.legalName

  const handleSave = useCallback(() => {
    if (!isValid) return
    setBaseline(draft)
    setSavedAt(Date.now())
    toast.success("Organization settings saved")
  }, [draft, isValid])

  const handleCancel = useCallback(() => {
    setDraft(baseline)
  }, [baseline])

  return (
    <FormFieldset isFirst={isFirst}>
      <FormSectionHeader
        eyebrow="Organization"
        title="Tenant details"
        description="Names that appear on receipts, invoices, and operator-facing surfaces."
      />
      <div className="mt-6 space-y-5">
        <FormFieldGroup>
          <FormField label="Company name" htmlFor="company-name" required>
            <Input
              id="company-name"
              value={draft.companyName}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, companyName: event.target.value }))
              }
            />
          </FormField>
          <FormField
            label="Legal name"
            htmlFor="legal-name"
            helperText="Optional — used on contracts and tax documents."
          >
            <Input
              id="legal-name"
              value={draft.legalName}
              onChange={(event) => setDraft((prev) => ({ ...prev, legalName: event.target.value }))}
            />
          </FormField>
        </FormFieldGroup>
        <FormActions
          savedHint={formatSavedHint(savedAt)}
          saveDisabled={!isDirty || !isValid}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      </div>
    </FormFieldset>
  )
}
