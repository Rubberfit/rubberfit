/**
 * Domain model for organization_preferences — regional + operational
 * defaults surfaced in /dashboard/settings/general.
 *
 * Migration: 20260514000001_create_organization_preferences.sql
 */

export type SupportedCurrency = "USD" | "EUR" | "GBP" | "CAD"
export type SupportedDateFormat = "MM/dd/yyyy" | "dd/MM/yyyy" | "yyyy-MM-dd"
export type UnitSystem = "imperial" | "metric"
export type SupportedLocale = "en-US" | "es-MX"

// Mirrors the time_zone CHECK constraint in migration
// 20260514000001_create_organization_preferences.sql. The DB enforces
// allowlist membership; this union keeps callers honest at compile time.
// Extend both sides together when adding a zone.
export type SupportedTimeZone =
  | "America/Chicago"
  | "America/New_York"
  | "America/Los_Angeles"
  | "America/Denver"
  | "America/Phoenix"
  | "Europe/London"
  | "Europe/Paris"
  | "Asia/Tokyo"

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
] as const

export const SUPPORTED_DATE_FORMATS: readonly SupportedDateFormat[] = [
  "MM/dd/yyyy",
  "dd/MM/yyyy",
  "yyyy-MM-dd",
] as const

export const SUPPORTED_UNIT_SYSTEMS: readonly UnitSystem[] = ["imperial", "metric"] as const

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ["en-US", "es-MX"] as const

export const DEFAULT_ORGANIZATION_PREFERENCES = {
  defaultCurrency: "USD" as SupportedCurrency,
  timeZone: "America/Chicago",
  dateFormat: "MM/dd/yyyy" as SupportedDateFormat,
  unitSystem: "imperial" as UnitSystem,
  lowStockThresholdSqft: 50,
  locale: "en-US" as SupportedLocale,
} as const

export interface OrganizationPreferences {
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
