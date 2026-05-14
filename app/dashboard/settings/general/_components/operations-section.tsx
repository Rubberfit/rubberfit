"use client"

import { useState, useEffect, useTransition, type ChangeEvent } from "react"
import { useTranslations, useLocale } from "next-intl"
import { toast } from "sonner"

import { updateUserPreferences } from "@/app/actions/user-preferences"
import {
  SUPPORTED_UNIT_SYSTEMS,
  isSupportedUnitSystem,
  type UnitSystem,
} from "@/src/application/preferences/constants"
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

const SQFT_PER_SQM = 10.7639

const UNIT_SYSTEM_LABEL_KEY: Record<UnitSystem, "operations.imperial" | "operations.metric"> = {
  imperial: "operations.imperial",
  metric: "operations.metric",
}

function formatThresholdDisplay(sqftValue: number, unitSystem: UnitSystem): string {
  if (unitSystem === "metric") {
    return (sqftValue / SQFT_PER_SQM).toFixed(2)
  }
  const fixed = sqftValue.toFixed(2)
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")
}

export function OperationsSection({ preferences, onSaved }: OperationsSectionProps) {
  const t = useTranslations("settings")
  const locale = useLocale()
  const [baseline, setBaseline] = useState<UserPreferences>(preferences)
  const [draft, setDraft] = useState<UserPreferences>(preferences)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [isPending, startTransition] = useTransition()
  const [isEditingThreshold, setIsEditingThreshold] = useState(false)
  const [thresholdInput, setThresholdInput] = useState(() =>
    formatThresholdDisplay(preferences.lowStockThresholdSqft, preferences.unitSystem)
  )

  useEffect(() => {
    setBaseline(preferences)
    setDraft(preferences)
    setSavedAt(0)
    setIsEditingThreshold(false)
    setThresholdInput(
      formatThresholdDisplay(preferences.lowStockThresholdSqft, preferences.unitSystem)
    )
  }, [preferences])

  useEffect(() => {
    if (!isEditingThreshold) {
      setThresholdInput(formatThresholdDisplay(draft.lowStockThresholdSqft, draft.unitSystem))
    }
  }, [draft.unitSystem])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline)

  const handleUnitSystemChange = (value: UnitSystem) => {
    setDraft((prev) => ({ ...prev, unitSystem: value }))
  }

  const handleThresholdChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setIsEditingThreshold(true)
    setThresholdInput(raw)
    const num = parseFloat(raw)
    if (Number.isFinite(num) && num >= 0) {
      const canonical = draft.unitSystem === "metric" ? num * SQFT_PER_SQM : num
      setDraft((prev) => ({ ...prev, lowStockThresholdSqft: canonical }))
    }
  }

  const handleThresholdBlur = () => {
    setIsEditingThreshold(false)
    setThresholdInput(formatThresholdDisplay(draft.lowStockThresholdSqft, draft.unitSystem))
  }

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateUserPreferences(draft)
      if ("error" in result) {
        toast.error(t("errors.unknown"))
        return
      }
      setBaseline(result.data)
      setSavedAt(Date.now())
      onSaved?.(result.data)
      toast.success(t("actions.saved"))
    })
  }

  const handleCancel = () => {
    setDraft(baseline)
    setSavedAt(0)
    setIsEditingThreshold(false)
    setThresholdInput(formatThresholdDisplay(baseline.lowStockThresholdSqft, baseline.unitSystem))
  }

  const thresholdPreview = formatThresholdDisplay(draft.lowStockThresholdSqft, draft.unitSystem)
  const thresholdUnit = draft.unitSystem === "metric" ? "m²" : "sqft"

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
        <FormFieldRow>
          <FormField label={t("operations.lowStockThreshold")} htmlFor="lowStockThreshold">
            <input
              id="lowStockThreshold"
              type="text"
              inputMode="decimal"
              value={thresholdInput}
              onChange={handleThresholdChange}
              onBlur={handleThresholdBlur}
              className="w-full h-10 px-3 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none"
            />
            <p className="mt-2 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)]">
              {t("operations.lowStockExplainer", {
                threshold: thresholdPreview,
                unit: thresholdUnit,
              })}
            </p>
          </FormField>
        </FormFieldRow>
      </FormFieldGroup>
      <FormActions
        savedHint={
          savedAt > 0
            ? t("actions.lastSaved", {
                when: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(savedAt),
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
