"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateUserPreferences } from "@/app/actions/user-preferences"
import {
  SUPPORTED_UNIT_SYSTEMS,
  isSupportedUnitSystem,
  type UnitSystem,
} from "@/src/application/preferences/constants"
import { formatInUserTimeZone } from "@/src/application/preferences/user-date-format"
import type { UserPreferences } from "@/src/infrastructure/models/user-preferences"
import {
  FormFieldset,
  FormSectionHeader,
  FormFieldGroup,
  FormFieldRow,
  FormField,
  FormActions,
} from "@/app/components/ui/forms"

interface OperationsSectionProps {
  preferences: UserPreferences
  onSaved?: (next: UserPreferences) => void
}

const UNIT_SYSTEM_LABEL_KEY: Record<UnitSystem, "operations.imperial" | "operations.metric"> = {
  imperial: "operations.imperial",
  metric: "operations.metric",
}

export function OperationsSection({ preferences, onSaved }: OperationsSectionProps) {
  const t = useTranslations("settings")
  const router = useRouter()
  const [baseline, setBaseline] = useState<UserPreferences>(preferences)
  const [draft, setDraft] = useState<UserPreferences>(preferences)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [isPending, startTransition] = useTransition()

  // Per-section dirty check — only fields this section owns. The
  // low-stock threshold moved to the workspace-defaults section in
  // PR 2c (operator-seeds-prints ruling); only `unitSystem` is a
  // personal display preference here.
  const isDirty = draft.unitSystem !== baseline.unitSystem
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    setBaseline(preferences)
    if (!isDirtyRef.current) {
      setDraft(preferences)
      setSavedAt(0)
    }
  }, [preferences])

  const handleUnitSystemChange = (value: UnitSystem) => {
    setDraft((prev) => ({ ...prev, unitSystem: value }))
  }

  const handleSave = () => {
    startTransition(async () => {
      // Send only the fields this section owns. Prevents stale baseline
      // values from regional fields (locale/currency/timeZone/dateFormat)
      // from overwriting what the user just saved over in RegionalSection.
      const result = await updateUserPreferences({
        unitSystem: draft.unitSystem,
      })
      if ("error" in result) {
        toast.error(t("errors.unknown"))
        return
      }
      setBaseline(result.data)
      setSavedAt(Date.now())
      onSaved?.(result.data)
      toast.success(t("actions.saved"))
      router.refresh()
    })
  }

  const handleCancel = () => {
    setDraft(baseline)
    setSavedAt(0)
  }

  return (
    <FormFieldset>
      <FormSectionHeader eyebrow={t("operations.eyebrow")} title={t("operations.title")} />
      <FormFieldGroup>
        <FormFieldRow>
          <FormField label={t("operations.unitSystem")} htmlFor="unitSystem">
            <div className="relative">
              <select
                id="unitSystem"
                value={draft.unitSystem}
                onChange={(e) => {
                  if (isSupportedUnitSystem(e.target.value)) {
                    handleUnitSystemChange(e.target.value)
                  }
                }}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none"
              >
                {SUPPORTED_UNIT_SYSTEMS.map((value) => (
                  <option key={value} value={value}>
                    {t(UNIT_SYSTEM_LABEL_KEY[value])}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
            <div className="flex items-start mt-3">
              <div className="border border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-4 py-3 rounded-none font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
                {draft.unitSystem === "metric" ? (
                  <>
                    <div>72&quot; × 144&quot;</div>
                    <div>72 sqft</div>
                  </>
                ) : (
                  <>
                    <div>1.83 × 3.66 m</div>
                    <div>6.69 m²</div>
                  </>
                )}
              </div>
              <span className="text-[var(--color-ink-faint)] text-[18px] mx-3 self-center">→</span>
              <div className="border border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-4 py-3 rounded-none font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]">
                {draft.unitSystem === "metric" ? (
                  <>
                    <div>1.83 × 3.66 m</div>
                    <div>6.69 m²</div>
                  </>
                ) : (
                  <>
                    <div>72&quot; × 144&quot;</div>
                    <div>72 sqft</div>
                  </>
                )}
              </div>
            </div>
            <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-ink-faint)] mt-2">
              {t("operations.referenceDimensions")}
            </div>
          </FormField>
        </FormFieldRow>
      </FormFieldGroup>
      <FormActions
        savedHint={
          savedAt > 0
            ? t("actions.lastSaved", {
                when: formatInUserTimeZone(
                  savedAt,
                  { locale: draft.locale, timeZone: draft.timeZone },
                  { timeStyle: "short" }
                ),
              })
            : undefined
        }
        saveDisabled={!isDirty || isPending}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </FormFieldset>
  )
}
