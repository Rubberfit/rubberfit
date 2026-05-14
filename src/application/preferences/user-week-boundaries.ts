/**
 * Compute the week's UTC instants *as observed in the operator's time
 * zone*. Used by the dashboard chrome ("This week" label + cuts-this-
 * week filter) so non-Chicago operators don't see week boundaries that
 * disagree with their saved preferences near midnight.
 *
 * Pure function. No DI, no React, no Supabase. Layer rule: structural
 * `ZonedWeekPreferencesInput` so this module does NOT import the
 * canonical `UserPreferences` from `src/infrastructure` (the canonical
 * shape is assignable by structure, callers pass it as-is).
 *
 * `date-fns`'s `startOfWeek` / `endOfWeek` operate in browser-local
 * time; this helper exists to replace those at any call site where the
 * operator's preference is the authority over their week.
 */

import type { SupportedTimeZone } from "@/src/application/preferences/constants"

export interface ZonedWeekPreferencesInput {
  timeZone?: SupportedTimeZone
}

const DEFAULT_TIME_ZONE: SupportedTimeZone = "America/Chicago"

export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6

interface CalendarDate {
  year: number
  month: number
  day: number
}

interface ZonedCalendarParts extends CalendarDate {
  weekday: number
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

function getZonedCalendarParts(date: Date, timeZone: SupportedTimeZone): ZonedCalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ""
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  }
}

/**
 * Calendar-date arithmetic via UTC anchors. Handles month/year rollover
 * (positive or negative `days`). Does NOT involve time-of-day or
 * timezone offsets — pure calendar math.
 */
function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  const anchor = new Date(Date.UTC(date.year, date.month - 1, date.day))
  anchor.setUTCDate(anchor.getUTCDate() + days)
  return {
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate(),
  }
}

/**
 * UTC offset *in minutes* applied to `date` when rendered in `timeZone`.
 * DST-correct because the offset is read at the requested instant.
 * Sign matches `Date.prototype.getTimezoneOffset()` (positive west of
 * UTC).
 */
function getZoneOffsetMinutes(date: Date, timeZone: SupportedTimeZone): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0")
  const Y = get("year")
  const M = get("month")
  const D = get("day")
  // Intl returns "24" for hour at midnight in some locales — fold to 0.
  const h = get("hour") % 24
  const m = get("minute")
  const s = get("second")
  // Sign convention matches `Date.prototype.getTimezoneOffset()`:
  // `utc = zoneLocal + offsetMinutes * 60_000`. Positive for zones west
  // of UTC (e.g., America/Chicago in CST returns +360).
  const zoneLocalAsUtc = Date.UTC(Y, M - 1, D, h, m, s)
  return (date.getTime() - zoneLocalAsUtc) / 60_000
}

/**
 * Converts a zone-local wall-clock midnight (Y-M-D at 00:00:00.000) to
 * the UTC instant for that moment. Two-pass: the offset for a naive
 * UTC anchor is a first approximation, and refining the anchor with
 * that offset gives the exact instant. Midnight is never within a DST
 * transition window for any supported zone (transitions happen at
 * 02:00–03:00 local), so the second pass converges in one step.
 */
function zonedMidnightToUtc(date: CalendarDate, timeZone: SupportedTimeZone): Date {
  const naive = new Date(Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0, 0))
  const naiveOffset = getZoneOffsetMinutes(naive, timeZone)
  // Refine: re-read the offset at the candidate instant. This handles
  // the case where `naive` lands on the wrong side of a DST boundary
  // because the calendar-date anchor's zone offset differs from the
  // zone's offset *at the resulting UTC instant*.
  const candidate = new Date(naive.getTime() + naiveOffset * 60_000)
  const refinedOffset = getZoneOffsetMinutes(candidate, timeZone)
  return new Date(naive.getTime() + refinedOffset * 60_000)
}

/**
 * UTC instants for the current week's start (Monday by default at
 * 00:00:00.000) and end (Sunday at 23:59:59.999), *as observed in the
 * operator's preferred timeZone*. The cuts filter at
 * `app/dashboard/page.tsx` uses these UTC ms compares to slice the
 * "This week" set consistently with the rendered week label.
 *
 * DST-correct: computes weekStart and weekEnd by deriving their
 * calendar dates first, then converting each to UTC via the in-zone
 * offset at that date — so a week straddling a DST transition has the
 * correct 23-hour or 25-hour duration in UTC ms, not 168h flat.
 *
 * For the default America/Chicago zone outside DST transitions, the
 * result matches `date-fns`'s `startOfWeek({ weekStartsOn: 1 })` when
 * the browser is running in America/Chicago.
 */
export function weekBoundariesInZone(
  now: Date,
  preferences?: ZonedWeekPreferencesInput,
  weekStartsOn: WeekStartsOn = 1
): { weekStart: Date; weekEnd: Date } {
  const timeZone = preferences?.timeZone ?? DEFAULT_TIME_ZONE
  const today = getZonedCalendarParts(now, timeZone)
  const daysBack = (today.weekday - weekStartsOn + 7) % 7

  const weekStartCal = addCalendarDays(today, -daysBack)
  const nextWeekStartCal = addCalendarDays(weekStartCal, 7)

  const weekStart = zonedMidnightToUtc(weekStartCal, timeZone)
  // weekEnd = last instant of the week's last day. Computed as
  // (next-week-start at zone midnight) - 1 ms so DST-aware durations
  // hold (e.g., spring-forward week is 168h - 1h - 1ms in UTC).
  const weekEnd = new Date(zonedMidnightToUtc(nextWeekStartCal, timeZone).getTime() - 1)
  return { weekStart, weekEnd }
}
