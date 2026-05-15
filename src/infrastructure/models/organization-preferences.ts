/**
 * Domain model for organization_preferences — created by migration
 * 20260514000001_create_organization_preferences.sql.
 *
 * The table is currently a parking lot for a future workspace-defaults
 * admin surface; reads + writes today flow through user_preferences
 * (see src/infrastructure/models/user-preferences.ts). The model is
 * kept here so we can revive it without a fresh migration.
 *
 * Field types come from the single source of truth in
 * src/application/preferences/constants.ts.
 */

import type {
  SupportedCurrency,
  SupportedDateFormat,
  SupportedLocale,
  SupportedTimeZone,
  UnitSystem,
} from "@/src/application/preferences/constants"

export type {
  SupportedCurrency,
  SupportedDateFormat,
  SupportedLocale,
  SupportedTimeZone,
  UnitSystem,
} from "@/src/application/preferences/constants"

export const DEFAULT_ORGANIZATION_PREFERENCES = {
  defaultCurrency: "USD" as SupportedCurrency,
  timeZone: "America/Chicago" as SupportedTimeZone,
  dateFormat: "MM/dd/yyyy" as SupportedDateFormat,
  unitSystem: "imperial" as UnitSystem,
  lowStockThresholdSqft: 50,
  locale: "en-US" as SupportedLocale,
} as const

export interface OrganizationPreferences {
  /**
   * Canonical org id, or empty string when the row comes from the
   * `buildFallbackOrganizationPreferences()` sentinel (used when the
   * provision trigger hasn't fired yet or the actor has no current
   * organization). Consumers MUST NOT use this as a truthy guard
   * for "do I have org prefs?" — read the picker fields directly,
   * or check the action's typed envelope at the call site.
   */
  organizationId: string
  defaultCurrency: SupportedCurrency
  timeZone: SupportedTimeZone
  dateFormat: SupportedDateFormat
  unitSystem: UnitSystem
  lowStockThresholdSqft: number
  locale: SupportedLocale
  createdAt: string
  updatedAt: string
}

/**
 * Builds a fully-typed `OrganizationPreferences` for the rare branch
 * where the auto-provision trigger hasn't created the row yet. Mirrors
 * `buildFallbackUserPreferences()`. Row metadata is left empty —
 * consumers of these defaults only read picker fields; audit fields
 * stay blank rather than being fabricated.
 */
export function buildFallbackOrganizationPreferences(organizationId = ""): OrganizationPreferences {
  return {
    organizationId,
    createdAt: "",
    updatedAt: "",
    ...DEFAULT_ORGANIZATION_PREFERENCES,
  }
}

export interface UpdateOrganizationPreferencesInput {
  defaultCurrency?: SupportedCurrency
  timeZone?: SupportedTimeZone
  dateFormat?: SupportedDateFormat
  unitSystem?: UnitSystem
  lowStockThresholdSqft?: number
  locale?: SupportedLocale
}

interface OrganizationPreferencesRow {
  organization_id: string
  default_currency: string
  time_zone: string
  date_format: string
  unit_system: string
  low_stock_threshold_sqft: number | string
  locale: string
  created_at: string
  updated_at: string
}

export function mapOrganizationPreferencesRow(
  row: OrganizationPreferencesRow
): OrganizationPreferences {
  const thresholdRaw = row.low_stock_threshold_sqft
  const threshold = typeof thresholdRaw === "string" ? Number(thresholdRaw) : thresholdRaw
  if (!Number.isFinite(threshold)) {
    throw new Error(
      `organization_preferences.low_stock_threshold_sqft is not a finite number: ${thresholdRaw}`
    )
  }
  return {
    organizationId: row.organization_id,
    defaultCurrency: row.default_currency as SupportedCurrency,
    timeZone: row.time_zone as SupportedTimeZone,
    dateFormat: row.date_format as SupportedDateFormat,
    unitSystem: row.unit_system as UnitSystem,
    lowStockThresholdSqft: threshold,
    locale: row.locale as SupportedLocale,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapUpdateInputToRow(
  input: UpdateOrganizationPreferencesInput
): Partial<OrganizationPreferencesRow> {
  const row: Partial<OrganizationPreferencesRow> = {}
  if (input.defaultCurrency !== undefined) row.default_currency = input.defaultCurrency
  if (input.timeZone !== undefined) row.time_zone = input.timeZone
  if (input.dateFormat !== undefined) row.date_format = input.dateFormat
  if (input.unitSystem !== undefined) row.unit_system = input.unitSystem
  if (input.lowStockThresholdSqft !== undefined)
    row.low_stock_threshold_sqft = input.lowStockThresholdSqft
  if (input.locale !== undefined) row.locale = input.locale
  return row
}
