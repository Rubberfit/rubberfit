"use client"

import { useState, useEffect, useTransition, useCallback } from "react"
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

type RegionalSectionProps = {
  preferences: OrganizationPreferences
  isAdmin: boolean
  onSaved?: (next: OrganizationPreferences) => void
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
      timeStyle: "short",
      timeZoneName: "short",
      timeZone: draft.timeZone,
    }).format(new Date())
  )

  useEffect(() => {
    setTimePreview(
      new Intl.DateTimeFormat(draft.locale, {
        timeStyle: "short",
        timeZoneName: "short",
        timeZone: draft.timeZone,
      }).format(new Date())
    )
    const id = setInterval(() => {
      setTimePreview(
        new Intl.DateTimeFormat(draft.locale, {
          timeStyle: "short",
          timeZoneName: "short",
          timeZone: draft.timeZone,
        }).format(new Date())
      )
    }, 30000)
    return () => clearInterval(id)
  }, [draft.locale, draft.timeZone])

  const datePreview = useCallback(() => {
    const date = new Date()
    const d = String(date.getDate()).padStart(2, "0")
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const y = String(date.getFullYear())
    return draft.dateFormat.replace("MM", m).replace("dd", d).replace("yyyy", y)
  }, [draft.dateFormat])

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
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, locale: e.target.value as "en-US" | "es-MX" }))
                }
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
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    defaultCurrency: e.target.value as OrganizationPreferences["defaultCurrency"],
                  }))
                }
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
                onChange={(e) => setDraft((prev) => ({ ...prev, timeZone: e.target.value }))}
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
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    dateFormat: e.target.value as OrganizationPreferences["dateFormat"],
                  }))
                }
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
