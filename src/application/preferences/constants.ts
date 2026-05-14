/**
 * Single source of truth for the allow-lists shared between:
 *   - the DB CHECK constraints in migrations
 *     20260514000001_create_organization_preferences.sql and
 *     20260514000002_create_user_preferences.sql
 *   - the zod schemas in app/actions/user-preferences.ts
 *   - the type guards + `<option>` lists in
 *     app/dashboard/settings/general/_components/regional-section.tsx
 *     and operations-section.tsx
 *
 * Extend a tuple here when adding a new value, then mirror it in the
 * matching migration. The derived union types keep callers honest
 * at compile time.
 */

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD"] as const
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]

export const SUPPORTED_DATE_FORMATS = ["MM/dd/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"] as const
export type SupportedDateFormat = (typeof SUPPORTED_DATE_FORMATS)[number]

export const SUPPORTED_UNIT_SYSTEMS = ["imperial", "metric"] as const
export type UnitSystem = (typeof SUPPORTED_UNIT_SYSTEMS)[number]

export const SUPPORTED_LOCALES = ["en-US", "es-MX"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const SUPPORTED_TIME_ZONES = [
  "America/Chicago",
  "America/New_York",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
] as const
export type SupportedTimeZone = (typeof SUPPORTED_TIME_ZONES)[number]

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
}
export function isSupportedDateFormat(value: string): value is SupportedDateFormat {
  return (SUPPORTED_DATE_FORMATS as readonly string[]).includes(value)
}
export function isSupportedUnitSystem(value: string): value is UnitSystem {
  return (SUPPORTED_UNIT_SYSTEMS as readonly string[]).includes(value)
}
export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}
export function isSupportedTimeZone(value: string): value is SupportedTimeZone {
  return (SUPPORTED_TIME_ZONES as readonly string[]).includes(value)
}
