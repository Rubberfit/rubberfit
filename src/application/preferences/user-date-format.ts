/**
 * Per-user date / time formatting helpers — read user preferences
 * (`dateFormat`, `timeZone`, `locale`) and render a date the way
 * the operator picked it on `/dashboard/settings/general`.
 *
 * Design notes:
 *   - Pure functions. No DI, no React, no Supabase. Importable from
 *     `app/`, `src/infrastructure/services/`, PDF builders, anywhere.
 *   - The structural `UserDatePreferencesInput` intentionally does NOT
 *     import `UserPreferences` from `src/infrastructure`; that would
 *     invert the layer dependency. The canonical `UserPreferences`
 *     object is assignable by shape, so call sites can pass it as-is.
 *   - Defaults mirror `DEFAULT_USER_PREFERENCES` in
 *     `src/infrastructure/models/user-preferences.ts`. Mirror because
 *     of the layer rule above; tests guard the parity.
 *   - Display only. NEVER use these for filenames, CSV cells, DB
 *     payloads, query bounds, sort keys, or quiet-hour math — those
 *     stay ISO. See the "LEAVE unchanged" allowlist in the PR 2
 *     scoping doc.
 *   - Returns `""` for null/undefined/invalid inputs so a single bad
 *     row never explodes a render or a PDF page. Call sites that need
 *     a placeholder should write `formatUserDate(...) || "—"`.
 */

import type {
  SupportedDateFormat,
  SupportedLocale,
  SupportedTimeZone,
} from "@/src/application/preferences/constants"

export type UserDateInput = Date | string | number | null | undefined

export interface UserDatePreferencesInput {
  dateFormat?: SupportedDateFormat
  timeZone?: SupportedTimeZone
  locale?: SupportedLocale
}

export const DEFAULT_DATE_FORMAT: SupportedDateFormat = "MM/dd/yyyy"
export const DEFAULT_TIME_ZONE: SupportedTimeZone = "America/Chicago"
export const DEFAULT_LOCALE: SupportedLocale = "en-US"

/** SQL DATE shape (`YYYY-MM-DD`). Treated as a calendar date, never an instant. */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

interface DateParts {
  year: string
  month: string
  day: string
}

function applyDateFormat(parts: DateParts, dateFormat: SupportedDateFormat): string {
  switch (dateFormat) {
    case "MM/dd/yyyy":
      return `${parts.month}/${parts.day}/${parts.year}`
    case "dd/MM/yyyy":
      return `${parts.day}/${parts.month}/${parts.year}`
    case "yyyy-MM-dd":
      return `${parts.year}-${parts.month}-${parts.day}`
  }
}

function getZonedDateParts(date: Date, timeZone: SupportedTimeZone): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return { year: get("year"), month: get("month"), day: get("day") }
}

/**
 * Coerces an arbitrary input into a usable Date or `null` for the
 * "invalid → empty string" branch. The dateOnly flag tells the caller
 * the input was a SQL DATE that must be split string-wise so a US
 * timezone doesn't shift `2026-01-01` back to `12/31/2025`.
 */
function parseInput(value: UserDateInput): { date: Date | null; dateOnly: boolean } {
  if (value === null || value === undefined) return { date: null, dateOnly: false }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? { date: value, dateOnly: false }
      : { date: null, dateOnly: false }
  }
  if (typeof value === "number") {
    const d = new Date(value)
    return Number.isFinite(d.getTime())
      ? { date: d, dateOnly: false }
      : { date: null, dateOnly: false }
  }
  if (typeof value === "string") {
    if (DATE_ONLY_PATTERN.test(value)) {
      // Parse with explicit local-midnight to give downstream Intl
      // calls a real Date, but the dateOnly flag ensures formatUserDate
      // splits the string directly rather than going through Intl.
      const d = new Date(`${value}T00:00:00`)
      return Number.isFinite(d.getTime())
        ? { date: d, dateOnly: true }
        : { date: null, dateOnly: false }
    }
    const d = new Date(value)
    return Number.isFinite(d.getTime())
      ? { date: d, dateOnly: false }
      : { date: null, dateOnly: false }
  }
  return { date: null, dateOnly: false }
}

/**
 * Renders `value` in the user's `dateFormat`. For instants, parts are
 * derived in the user's `timeZone`. For SQL DATE strings, the calendar
 * date is preserved verbatim (no UTC shift).
 *
 * Returns `""` for null / undefined / NaN / unparseable strings, and
 * for shape-valid SQL DATEs whose month/day pair doesn't represent a
 * real calendar day (`"2026-13-45"` → `""`, not `"13/45/2026"`).
 */
export function formatUserDate(
  value: UserDateInput,
  preferences?: UserDatePreferencesInput
): string {
  const dateFormat = preferences?.dateFormat ?? DEFAULT_DATE_FORMAT

  // Calendar-date fast path: split the SQL string directly. Skips Intl
  // entirely so a `2026-01-01` PO requested-date doesn't drift to
  // `12/31/2025` when the operator is in `America/Los_Angeles`.
  if (typeof value === "string" && DATE_ONLY_PATTERN.test(value)) {
    const [year, month, day] = value.split("-")
    // Round-trip through Date to reject shape-valid garbage like
    // `2026-13-45` or `2026-02-30`. Date() silently rolls these into
    // the next month, so we'd otherwise render nonsense as fact.
    const probe = new Date(`${value}T00:00:00`)
    if (
      Number.isNaN(probe.getTime()) ||
      probe.getFullYear() !== Number(year) ||
      probe.getMonth() + 1 !== Number(month) ||
      probe.getDate() !== Number(day)
    ) {
      return ""
    }
    return applyDateFormat({ year, month, day }, dateFormat)
  }

  const { date } = parseInput(value)
  if (!date) return ""

  const parts = getZonedDateParts(date, preferences?.timeZone ?? DEFAULT_TIME_ZONE)
  return applyDateFormat(parts, dateFormat)
}

/**
 * Renders `value` as `<dateFormat> <localized time + short zone>`.
 * For SQL DATE inputs, returns just the date (no synthetic 00:00 time).
 *
 * For custom Intl options (seconds, weekday, month names, no zone),
 * use `formatInUserTimeZone()` instead.
 */
export function formatUserDateTime(
  value: UserDateInput,
  preferences?: UserDatePreferencesInput
): string {
  const { date, dateOnly } = parseInput(value)
  if (!date) return ""

  const datePart = formatUserDate(value, preferences)
  if (dateOnly) return datePart

  const timePart = new Intl.DateTimeFormat(preferences?.locale ?? DEFAULT_LOCALE, {
    timeZone: preferences?.timeZone ?? DEFAULT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date)
  return `${datePart} ${timePart}`
}

/**
 * Escape hatch for one-off Intl options (e.g. `weekday: "short"`,
 * `month: "long"`, `second: "2-digit"`). Always applies the user's
 * timeZone and locale; caller controls the rest.
 *
 * Designed for **instants** (Date / number / ISO timestamp). SQL DATE
 * strings get a midnight Date passed through Intl, which can drift
 * across timezones — for calendar-date display, prefer `formatUserDate`.
 */
export function formatInUserTimeZone(
  value: UserDateInput,
  preferences?: UserDatePreferencesInput,
  options?: Omit<Intl.DateTimeFormatOptions, "timeZone">
): string {
  const { date } = parseInput(value)
  if (!date) return ""
  return new Intl.DateTimeFormat(preferences?.locale ?? DEFAULT_LOCALE, {
    ...options,
    timeZone: preferences?.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(date)
}
