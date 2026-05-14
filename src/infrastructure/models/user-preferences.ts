/**
 * Domain model for user_preferences — per-user regional + operational
 * defaults surfaced in /dashboard/settings/general. Any operator
 * controls their own row.
 *
 * Migration: 20260514000002_create_user_preferences.sql
 *
 * Field types reuse the enums from organization-preferences.ts (the
 * value space is identical — currency / time zone / date format / unit
 * system / locale match the same DB CHECK constraints).
 */

import type {
  SupportedCurrency,
  SupportedDateFormat,
  SupportedLocale,
  SupportedTimeZone,
  UnitSystem,
} from "@/src/application/preferences/constants"

export const DEFAULT_USER_PREFERENCES = {
  defaultCurrency: "USD" as SupportedCurrency,
  timeZone: "America/Chicago" as SupportedTimeZone,
  dateFormat: "MM/dd/yyyy" as SupportedDateFormat,
  unitSystem: "imperial" as UnitSystem,
  lowStockThresholdSqft: 50,
  locale: "en-US" as SupportedLocale,
} as const

export interface UserPreferences {
  userId: string
  defaultCurrency: SupportedCurrency
  timeZone: SupportedTimeZone
  dateFormat: SupportedDateFormat
  unitSystem: UnitSystem
  lowStockThresholdSqft: number
  locale: SupportedLocale
  createdAt: string
  updatedAt: string
}

export interface UpdateUserPreferencesInput {
  defaultCurrency?: SupportedCurrency
  timeZone?: SupportedTimeZone
  dateFormat?: SupportedDateFormat
  unitSystem?: UnitSystem
  lowStockThresholdSqft?: number
  locale?: SupportedLocale
}

interface UserPreferencesRow {
  user_id: string
  default_currency: string
  time_zone: string
  date_format: string
  unit_system: string
  low_stock_threshold_sqft: number | string
  locale: string
  created_at: string
  updated_at: string
}

export function mapUserPreferencesRow(row: UserPreferencesRow): UserPreferences {
  const thresholdRaw = row.low_stock_threshold_sqft
  const threshold = typeof thresholdRaw === "string" ? Number(thresholdRaw) : thresholdRaw
  if (!Number.isFinite(threshold)) {
    throw new Error(
      `user_preferences.low_stock_threshold_sqft is not a finite number: ${thresholdRaw}`
    )
  }
  return {
    userId: row.user_id,
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
  input: UpdateUserPreferencesInput
): Partial<UserPreferencesRow> {
  const row: Partial<UserPreferencesRow> = {}
  if (input.defaultCurrency !== undefined) row.default_currency = input.defaultCurrency
  if (input.timeZone !== undefined) row.time_zone = input.timeZone
  if (input.dateFormat !== undefined) row.date_format = input.dateFormat
  if (input.unitSystem !== undefined) row.unit_system = input.unitSystem
  if (input.lowStockThresholdSqft !== undefined)
    row.low_stock_threshold_sqft = input.lowStockThresholdSqft
  if (input.locale !== undefined) row.locale = input.locale
  return row
}
