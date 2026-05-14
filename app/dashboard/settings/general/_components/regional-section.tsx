"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateUserPreferences } from "@/app/actions/user-preferences"
import { setLocale as setLocaleAction } from "@/app/actions/locale"
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIME_ZONES,
  isSupportedCurrency,
  isSupportedDateFormat,
  isSupportedLocale,
  isSupportedTimeZone,
} from "@/src/application/preferences/constants"
import {
  formatInUserTimeZone,
  formatUserDate,
} from "@/src/application/preferences/user-date-format"
import type { UserPreferences } from "@/src/infrastructure/models/user-preferences"
import {
  FormFieldset,
  FormSectionHeader,
  FormFieldGroup,
  FormFieldRow,
  FormField,
  FormActions,
} from "@/app/components/ui/forms"

interface RegionalSectionProps {
  preferences: UserPreferences
  onSaved?: (next: UserPreferences) => void
}

const LOCALE_LABELS: Record<UserPreferences["locale"], string> = {
  "en-US": "English (US)",
  "es-MX": "Español (México)",
}

export function RegionalSection({ preferences, onSaved }: RegionalSectionProps) {
  const t = useTranslations("settings")
  const router = useRouter()
  const [baseline, setBaseline] = useState<UserPreferences>(preferences)
  const [draft, setDraft] = useState<UserPreferences>(preferences)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [isPending, startTransition] = useTransition()

  // Scope the dirty check to ONLY the fields this section owns. A
  // whole-object compare would treat a sibling section's saved field
  // (refreshed into baseline but stale in draft, since the guard below
  // preserves the user's in-flight edits) as "dirty here", leaving the
  // Save button stuck enabled.
  const isDirty =
    draft.locale !== baseline.locale ||
    draft.defaultCurrency !== baseline.defaultCurrency ||
    draft.timeZone !== baseline.timeZone ||
    draft.dateFormat !== baseline.dateFormat
  // Keep a ref in sync so the [preferences] effect can read the current
  // dirty state without taking draft/baseline as deps (which would make
  // the effect fire on every keystroke).
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  useEffect(() => {
    // Always anchor baseline to the latest server value so isDirty stays
    // accurate when a sibling section's save triggers router.refresh().
    setBaseline(preferences)
    // Only reset draft + savedAt when the user has no in-flight edits.
    // Without this guard, a sibling section's refresh would wipe what
    // the operator is mid-typing.
    if (!isDirtyRef.current) {
      setDraft(preferences)
      setSavedAt(0)
    }
  }, [preferences])

  const currencyPreview = new Intl.NumberFormat(draft.locale, {
    style: "currency",
    currency: draft.defaultCurrency,
  }).format(1250)

  // Live time preview re-uses the canonical helper so what the
  // operator sees here matches what every other dashboard surface
  // will render after they save.
  const formatTimePreview = () =>
    formatInUserTimeZone(
      new Date(),
      { locale: draft.locale, timeZone: draft.timeZone },
      { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
    )
  const [timePreview, setTimePreview] = useState(formatTimePreview)

  useEffect(() => {
    setTimePreview(formatTimePreview())
    const id = setInterval(() => setTimePreview(formatTimePreview()), 30000)
    return () => clearInterval(id)
    // formatTimePreview closes over draft.locale + draft.timeZone via
    // the ref-equality of `draft`; depending only on the two keys
    // keeps the interval re-init scoped to actual zone/locale flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.locale, draft.timeZone])

  const datePreview = formatUserDate(new Date(), {
    dateFormat: draft.dateFormat,
    timeZone: draft.timeZone,
  })

  const handleSave = () => {
    const localeChanged = draft.locale !== baseline.locale
    startTransition(async () => {
      // Send only the fields this section owns. Without this filter,
      // saving here would silently overwrite the OperationsSection's
      // in-flight unit-system or threshold edits with stale baseline
      // values.
      const result = await updateUserPreferences({
        locale: draft.locale,
        defaultCurrency: draft.defaultCurrency,
        timeZone: draft.timeZone,
        dateFormat: draft.dateFormat,
      })
      if ("error" in result) {
        toast.error(t("errors.unknown"))
        return
      }
      setBaseline(result.data)
      setSavedAt(Date.now())
      onSaved?.(result.data)
      toast.success(t("actions.saved"))
      if (localeChanged) {
        // Mirror nav-user.tsx: setLocaleAction's discriminated-union
        // return must be checked, otherwise a failed cookie write
        // strands NEXT_LOCALE on the previous locale while the DB
        // already holds the new one.
        const localeResult = await setLocaleAction({ locale: result.data.locale })
        if (!localeResult.ok) {
          toast.error(t("errors.unknown"))
          return
        }
      }
      // Always refresh so the sibling section's [preferences] effect
      // sees the latest server state and re-anchors its baseline.
      router.refresh()
    })
  }

  const handleCancel = () => {
    setDraft(baseline)
    setSavedAt(0)
  }

  return (
    <FormFieldset>
      <FormSectionHeader eyebrow={t("regional.eyebrow")} title={t("regional.title")} />
      <FormFieldGroup>
        <FormFieldRow>
          <FormField label={t("regional.language")} htmlFor="language">
            <div className="relative">
              <select
                id="language"
                value={draft.locale}
                onChange={(e) => {
                  if (isSupportedLocale(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, locale: next }))
                  }
                }}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none"
              >
                {SUPPORTED_LOCALES.map((value) => (
                  <option key={value} value={value}>
                    {LOCALE_LABELS[value]}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
          </FormField>
          <FormField label={t("regional.currency")} htmlFor="currency">
            <div className="relative">
              <select
                id="currency"
                value={draft.defaultCurrency}
                onChange={(e) => {
                  if (isSupportedCurrency(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, defaultCurrency: next }))
                  }
                }}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none"
              >
                {SUPPORTED_CURRENCIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
            <div className="flex justify-end mt-2 font-[family-name:var(--font-mono)] text-[12px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              <span className="text-[var(--color-ink-faint)] uppercase tracking-[0.18em] text-[10px] mr-2">
                {t("regional.preview")}
              </span>
              <span className="text-[var(--color-ink)]">{currencyPreview}</span>
            </div>
          </FormField>
        </FormFieldRow>
        <FormFieldRow>
          <FormField label={t("regional.timeZone")} htmlFor="timeZone">
            <div className="relative">
              <select
                id="timeZone"
                value={draft.timeZone}
                onChange={(e) => {
                  if (isSupportedTimeZone(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, timeZone: next }))
                  }
                }}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none"
              >
                {SUPPORTED_TIME_ZONES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
            <div className="flex justify-end mt-2 font-[family-name:var(--font-mono)] text-[12px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              <span className="text-[var(--color-ink-faint)] uppercase tracking-[0.18em] text-[10px] mr-2">
                {t("regional.current")}
              </span>
              <span className="text-[var(--color-ink)]">{timePreview}</span>
            </div>
          </FormField>
          <FormField label={t("regional.dateFormat")} htmlFor="dateFormat">
            <div className="relative">
              <select
                id="dateFormat"
                value={draft.dateFormat}
                onChange={(e) => {
                  if (isSupportedDateFormat(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, dateFormat: next }))
                  }
                }}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none"
              >
                {SUPPORTED_DATE_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
            <div className="flex justify-end mt-2 font-[family-name:var(--font-mono)] text-[12px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              <span className="text-[var(--color-ink-faint)] uppercase tracking-[0.18em] text-[10px] mr-2">
                {t("regional.preview")}
              </span>
              <span className="text-[var(--color-ink)]">{datePreview}</span>
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
