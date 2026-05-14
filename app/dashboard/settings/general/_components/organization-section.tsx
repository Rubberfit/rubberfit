"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { updateOrganizationPreferences } from "@/app/actions/organization-preferences"
import { useSetOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"
import {
  SUPPORTED_CURRENCIES,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIME_ZONES,
  SUPPORTED_UNIT_SYSTEMS,
  isSupportedCurrency,
  isSupportedDateFormat,
  isSupportedLocale,
  isSupportedTimeZone,
  isSupportedUnitSystem,
  type UnitSystem,
} from "@/src/application/preferences/constants"
import {
  formatInUserTimeZone,
  formatUserDate,
} from "@/src/application/preferences/user-date-format"
import type { OrganizationPreferences } from "@/src/infrastructure/models/organization-preferences"
import {
  FormActions,
  FormField,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"

interface OrganizationSectionProps {
  preferences: OrganizationPreferences
  isAdmin: boolean
  isFirst?: boolean
}

const LOCALE_LABELS: Record<OrganizationPreferences["locale"], string> = {
  "en-US": "English (US)",
  "es-MX": "Español (México)",
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

/**
 * Workspace-defaults editor. Governs shared / printed output —
 * PDF dates + currency, billing dates, low-stock seeds for new
 * materials, and (under PR 2d) the cutting-engine canvas units.
 * Personal-screen rendering is still controlled by the user's own
 * row in <RegionalSection> + <OperationsSection>.
 *
 * Owner/admin only — RLS is the second guard at the DB. Members
 * shouldn't reach this page today (`/dashboard/settings/general`
 * is gated to `manageUsers`), but the section accepts `isAdmin` as
 * a prop so a future read-only member surface is one prop change
 * away.
 */
export function OrganizationSection({
  preferences,
  isAdmin,
  isFirst = false,
}: OrganizationSectionProps) {
  const t = useTranslations("settings")
  const router = useRouter()
  const setOrganizationPreferences = useSetOrganizationPreferences()
  const [baseline, setBaseline] = useState<OrganizationPreferences>(preferences)
  const [draft, setDraft] = useState<OrganizationPreferences>(preferences)
  const [savedAt, setSavedAt] = useState<number>(0)
  const [isPending, startTransition] = useTransition()
  const [thresholdInput, setThresholdInput] = useState(() =>
    formatThresholdDisplay(preferences.lowStockThresholdSqft, preferences.unitSystem)
  )

  const isDirty =
    draft.locale !== baseline.locale ||
    draft.defaultCurrency !== baseline.defaultCurrency ||
    draft.timeZone !== baseline.timeZone ||
    draft.dateFormat !== baseline.dateFormat ||
    draft.unitSystem !== baseline.unitSystem ||
    draft.lowStockThresholdSqft !== baseline.lowStockThresholdSqft
  // Sync the dirty ref via effect (not during render) so the
  // preferences-refresh guard below reads the latest value without
  // any of the render-purity caveats CodeRabbit's React-rules check
  // flags. The dep-less effect runs after every commit; the cost is
  // a single ref write, never a re-render.
  const isDirtyRef = useRef(isDirty)
  useEffect(() => {
    isDirtyRef.current = isDirty
  })

  useEffect(() => {
    setBaseline(preferences)
    // Re-anchor draft + threshold UI to the latest server state when
    // the user has no in-flight edits. `savedAt` is intentionally NOT
    // cleared here — without that exclusion, the "Last saved HH:mm"
    // hint flashes once after handleSave's router.refresh() lands
    // and immediately disappears. Explicit reset paths
    // (handleCancel, the next save) own the savedAt lifecycle.
    if (!isDirtyRef.current) {
      setDraft(preferences)
      setThresholdInput(
        formatThresholdDisplay(preferences.lowStockThresholdSqft, preferences.unitSystem)
      )
    }
  }, [preferences])

  const handleLocaleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (isSupportedLocale(value)) setDraft((prev) => ({ ...prev, locale: value }))
  }

  const handleCurrencyChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (isSupportedCurrency(value)) setDraft((prev) => ({ ...prev, defaultCurrency: value }))
  }

  const handleTimeZoneChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (isSupportedTimeZone(value)) setDraft((prev) => ({ ...prev, timeZone: value }))
  }

  const handleDateFormatChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (isSupportedDateFormat(value)) setDraft((prev) => ({ ...prev, dateFormat: value }))
  }

  const handleUnitSystemChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value
    if (!isSupportedUnitSystem(value)) return
    setDraft((prev) => ({ ...prev, unitSystem: value }))
    setThresholdInput(formatThresholdDisplay(draft.lowStockThresholdSqft, value))
  }

  const handleThresholdChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    setThresholdInput(raw)
    const num = parseFloat(raw)
    if (Number.isFinite(num) && num >= 0) {
      const canonical = draft.unitSystem === "metric" ? num * SQFT_PER_SQM : num
      setDraft((prev) => ({ ...prev, lowStockThresholdSqft: canonical }))
    }
  }

  const handleThresholdBlur = () => {
    setThresholdInput(formatThresholdDisplay(draft.lowStockThresholdSqft, draft.unitSystem))
  }

  const currencyPreview = new Intl.NumberFormat(draft.locale, {
    style: "currency",
    currency: draft.defaultCurrency,
  }).format(1250)

  // 30s tick forces a re-render so the live preview stays current
  // without writing setState from inside an effect (CodeRabbit's
  // suggestion: useMemo + tick beats setState-on-mount + interval).
  const [timeTick, setTimeTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 30000)
    return () => clearInterval(id)
  }, [])
  const timePreview = useMemo(
    () =>
      formatInUserTimeZone(
        new Date(),
        { locale: draft.locale, timeZone: draft.timeZone },
        { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
      ),
    // `timeTick` re-evaluates `new Date()` every 30s. Locale + zone
    // changes recompute immediately.
    [draft.locale, draft.timeZone, timeTick]
  )

  const datePreview = formatUserDate(new Date(), {
    dateFormat: draft.dateFormat,
    timeZone: draft.timeZone,
  })

  const thresholdPreview = formatThresholdDisplay(draft.lowStockThresholdSqft, draft.unitSystem)
  const thresholdUnit = draft.unitSystem === "metric" ? "m²" : "sqft"

  const handleSave = () => {
    if (!isAdmin) return
    startTransition(async () => {
      // Wrap in try/catch so a thrown action error (e.g. the
      // SubscriptionRequiredError that `requireActiveSubscription`
      // raises when a lapsed admin hits the action directly) lands
      // as a toast instead of an uncaught render-tree crash.
      try {
        const result = await updateOrganizationPreferences({
          locale: draft.locale,
          defaultCurrency: draft.defaultCurrency,
          timeZone: draft.timeZone,
          dateFormat: draft.dateFormat,
          unitSystem: draft.unitSystem,
          lowStockThresholdSqft: draft.lowStockThresholdSqft,
        })
        if ("error" in result) {
          if (result.error === "forbidden") toast.error(t("errors.forbidden"))
          else toast.error(t("errors.unknown"))
          return
        }
        setBaseline(result.data)
        setSavedAt(Date.now())
        setOrganizationPreferences(result.data)
        toast.success(t("actions.saved"))
        router.refresh()
      } catch (error) {
        console.error("[organization-section] save failed:", error)
        toast.error(t("errors.unknown"))
      }
    })
  }

  const handleCancel = () => {
    setDraft(baseline)
    setSavedAt(0)
    setThresholdInput(formatThresholdDisplay(baseline.lowStockThresholdSqft, baseline.unitSystem))
  }

  const selectClassName =
    "w-full h-10 px-3 pr-8 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none appearance-none disabled:opacity-60 disabled:cursor-not-allowed"

  return (
    <FormFieldset isFirst={isFirst}>
      <FormSectionHeader
        eyebrow={t("organization.eyebrow")}
        title={t("organization.title")}
        description={t("organization.description")}
      />
      <FormFieldGroup>
        <FormFieldRow>
          <FormField label={t("regional.language")} htmlFor="org-language">
            <div className="relative">
              <select
                id="org-language"
                value={draft.locale}
                disabled={!isAdmin}
                onChange={handleLocaleChange}
                className={selectClassName}
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
          <FormField label={t("regional.currency")} htmlFor="org-currency">
            <div className="relative">
              <select
                id="org-currency"
                value={draft.defaultCurrency}
                disabled={!isAdmin}
                onChange={handleCurrencyChange}
                className={selectClassName}
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
          <FormField label={t("regional.timeZone")} htmlFor="org-timeZone">
            <div className="relative">
              <select
                id="org-timeZone"
                value={draft.timeZone}
                disabled={!isAdmin}
                onChange={handleTimeZoneChange}
                className={selectClassName}
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
          <FormField label={t("regional.dateFormat")} htmlFor="org-dateFormat">
            <div className="relative">
              <select
                id="org-dateFormat"
                value={draft.dateFormat}
                disabled={!isAdmin}
                onChange={handleDateFormatChange}
                className={selectClassName}
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
        <FormFieldRow>
          <FormField label={t("operations.unitSystem")} htmlFor="org-unitSystem">
            <div className="relative">
              <select
                id="org-unitSystem"
                value={draft.unitSystem}
                disabled={!isAdmin}
                onChange={handleUnitSystemChange}
                className={selectClassName}
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
          </FormField>
          <FormField label={t("operations.lowStockThreshold")} htmlFor="org-lowStockThreshold">
            <input
              id="org-lowStockThreshold"
              type="text"
              inputMode="decimal"
              value={thresholdInput}
              disabled={!isAdmin}
              onChange={handleThresholdChange}
              onBlur={handleThresholdBlur}
              className="w-full h-10 px-3 bg-[var(--color-surface)] border border-[var(--color-rule)] text-[var(--color-ink)] font-[family-name:var(--font-sans)] text-[13px] rounded-none disabled:opacity-60 disabled:cursor-not-allowed"
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
      {isAdmin ? (
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
      ) : (
        <p className="mt-4 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-soft)]">
          {t("regional.readonly")}
        </p>
      )}
    </FormFieldset>
  )
}
