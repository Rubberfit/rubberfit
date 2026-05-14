"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateOrganizationPreferences } from "@/app/actions/organization-preferences"
import { setLocale as setLocaleAction } from "@/app/actions/locale"
import type { OrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"
import {
  FormFieldset,
  FormSectionHeader,
  FormFieldGroup,
  FormFieldRow,
  FormField,
  FormActions,
} from "@/app/components/ui/forms"

interface RegionalSectionProps {
  preferences: OrganizationPreferences
  isAdmin: boolean
  onSaved?: (next: OrganizationPreferences) => void
}

type AppLocale = OrganizationPreferences["locale"]
type AppCurrency = OrganizationPreferences["defaultCurrency"]
type AppDateFormat = OrganizationPreferences["dateFormat"]
type AppTimeZone = OrganizationPreferences["timeZone"]

const TIME_ZONE_VALUES: readonly AppTimeZone[] = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
]

function isAppLocale(value: string): value is AppLocale {
  return value === "en-US" || value === "es-MX"
}
function isAppCurrency(value: string): value is AppCurrency {
  return value === "USD" || value === "EUR" || value === "GBP" || value === "CAD"
}
function isAppDateFormat(value: string): value is AppDateFormat {
  return value === "MM/dd/yyyy" || value === "dd/MM/yyyy" || value === "yyyy-MM-dd"
}
function isAppTimeZone(value: string): value is AppTimeZone {
  return (TIME_ZONE_VALUES as readonly string[]).includes(value)
}

export function RegionalSection({ preferences, isAdmin, onSaved }: RegionalSectionProps) {
  const t = useTranslations("settings")
  const locale = useLocale()
  const router = useRouter()
  const [baseline, setBaseline] = useState<OrganizationPreferences>(preferences)
  const [draft, setDraft] = useState<OrganizationPreferences>(preferences)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setBaseline(preferences)
    setDraft(preferences)
    setSavedAt(0)
  }, [preferences])

  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline)

  const currencyPreview = new Intl.NumberFormat(draft.locale, {
    style: "currency",
    currency: draft.defaultCurrency,
  }).format(1250)

  const [timePreview, setTimePreview] = useState(() =>
    new Intl.DateTimeFormat(draft.locale, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: draft.timeZone,
    }).format(new Date())
  )

  useEffect(() => {
    const format = () =>
      new Intl.DateTimeFormat(draft.locale, {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: draft.timeZone,
      }).format(new Date())
    setTimePreview(format())
    const id = setInterval(() => setTimePreview(format()), 30000)
    return () => clearInterval(id)
  }, [draft.locale, draft.timeZone])

  const datePreview = (): string => {
    const date = new Date()
    const d = String(date.getDate()).padStart(2, "0")
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const y = String(date.getFullYear())
    return draft.dateFormat.replace("MM", m).replace("dd", d).replace("yyyy", y)
  }

  const handleSave = () => {
    const localeChanged = draft.locale !== baseline.locale
    startTransition(async () => {
      const result = await updateOrganizationPreferences(draft)
      if ("error" in result) {
        const code = result.error === "forbidden" ? "forbidden" : "unknown"
        toast.error(t(`errors.${code}`))
        return
      }
      setBaseline(result.data)
      setSavedAt(Date.now())
      onSaved?.(result.data)
      toast.success(t("actions.saved"))
      if (localeChanged) {
        await setLocaleAction({ locale: result.data.locale })
        // Refresh so the avatar menu's useLocale + NextIntlClientProvider
        // pick up the new cookie. Without this, the dashboard chrome stays
        // in the old locale until the next navigation.
        router.refresh()
      }
    })
  }

  const handleCancel = () => {
    setDraft(baseline)
    setSavedAt(0)
  }

  return (
    <FormFieldset>
      <FormSectionHeader eyebrow={t("regional.eyebrow")} title={t("regional.title")} />
      {!isAdmin && (
        <p className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-[var(--color-ink-faint)] mt-2">
          {t("regional.readonly")}
        </p>
      )}
      <FormFieldGroup>
        <FormFieldRow>
          <FormField label={t("regional.language")} htmlFor="language">
            <div className="relative">
              <select
                id="language"
                value={draft.locale}
                onChange={(e) => {
                  if (isAppLocale(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, locale: next }))
                  }
                }}
                disabled={!isAdmin}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="en-US">English (US)</option>
                <option value="es-MX">Español (México)</option>
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
                  if (isAppCurrency(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, defaultCurrency: next }))
                  }
                }}
                disabled={!isAdmin}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
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
                  if (isAppTimeZone(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, timeZone: next }))
                  }
                }}
                disabled={!isAdmin}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/Denver">America/Denver</option>
                <option value="America/Phoenix">America/Phoenix</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
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
                  if (isAppDateFormat(e.target.value)) {
                    const next = e.target.value
                    setDraft((prev) => ({ ...prev, dateFormat: next }))
                  }
                }}
                disabled={!isAdmin}
                className="w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="MM/dd/yyyy">MM/dd/yyyy</option>
                <option value="dd/MM/yyyy">dd/MM/yyyy</option>
                <option value="yyyy-MM-dd">yyyy-MM-dd</option>
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] text-[10px]">
                ▼
              </span>
            </div>
            <div className="flex justify-end mt-2 font-[family-name:var(--font-mono)] text-[12px] tracking-[0.04em] text-[var(--color-ink-soft)]">
              <span className="text-[var(--color-ink-faint)] uppercase tracking-[0.18em] text-[10px] mr-2">
                {t("regional.preview")}
              </span>
              <span className="text-[var(--color-ink)]">{datePreview()}</span>
            </div>
          </FormField>
        </FormFieldRow>
      </FormFieldGroup>
      {isAdmin && (
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
      )}
    </FormFieldset>
  )
}
