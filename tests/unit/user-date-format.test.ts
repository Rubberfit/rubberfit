import { describe, expect, it } from "vitest"

import {
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIME_ZONES,
} from "@/src/application/preferences/constants"
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  formatInUserTimeZone,
  formatUserDate,
  formatUserDateTime,
} from "@/src/application/preferences/user-date-format"
import { DEFAULT_USER_PREFERENCES } from "@/src/infrastructure/models/user-preferences"

/**
 * The helper deliberately does not import DEFAULT_USER_PREFERENCES
 * from the infrastructure layer (would invert layer rules). This
 * test guards the duplication so a future change to the canonical
 * defaults can't silently leave the helper stale.
 */
describe("default parity with DEFAULT_USER_PREFERENCES", () => {
  it("dateFormat default matches the canonical user-preferences default", () => {
    expect(DEFAULT_DATE_FORMAT).toBe(DEFAULT_USER_PREFERENCES.dateFormat)
  })
  it("timeZone default matches the canonical user-preferences default", () => {
    expect(DEFAULT_TIME_ZONE).toBe(DEFAULT_USER_PREFERENCES.timeZone)
  })
  it("locale default matches the canonical user-preferences default", () => {
    expect(DEFAULT_LOCALE).toBe(DEFAULT_USER_PREFERENCES.locale)
  })
})

describe("formatUserDate — invalid input contract", () => {
  it.each([null, undefined, "", "not-a-date", Number.NaN, new Date(Number.NaN)] as const)(
    "returns empty string for %p",
    (value) => {
      expect(formatUserDate(value)).toBe("")
    }
  )
})

describe("formatUserDate — defaults", () => {
  it("uses MM/dd/yyyy + America/Chicago when no preferences are passed", () => {
    // 2026-05-14T10:30:00Z is 2026-05-14 in America/Chicago (CDT, UTC-5).
    expect(formatUserDate(new Date("2026-05-14T10:30:00Z"))).toBe("05/14/2026")
  })
  it("uses defaults for fields not provided in a partial preferences arg", () => {
    expect(formatUserDate(new Date("2026-05-14T10:30:00Z"), { dateFormat: "yyyy-MM-dd" })).toBe(
      "2026-05-14"
    )
  })
})

describe("formatUserDate — every dateFormat", () => {
  // Mid-day UTC so every supported zone agrees on the calendar date —
  // this case only varies the format, not the zone.
  const instant = new Date("2026-05-14T18:00:00Z")
  it.each(SUPPORTED_DATE_FORMATS)("renders %s correctly", (dateFormat) => {
    const result = formatUserDate(instant, { dateFormat, timeZone: "America/Chicago" })
    switch (dateFormat) {
      case "MM/dd/yyyy":
        expect(result).toBe("05/14/2026")
        break
      case "dd/MM/yyyy":
        expect(result).toBe("14/05/2026")
        break
      case "yyyy-MM-dd":
        expect(result).toBe("2026-05-14")
        break
    }
  })
})

describe("formatUserDate — date-only (SQL DATE) stability", () => {
  // The bug guarded here: parsing `2026-01-01` through Date() lands at
  // UTC midnight, which a US zone would render as Dec 31, 2025. Calendar
  // dates must stay calendar dates regardless of the user's zone.
  it.each(SUPPORTED_TIME_ZONES)("preserves the calendar date in %s", (timeZone) => {
    expect(formatUserDate("2026-01-01", { dateFormat: "yyyy-MM-dd", timeZone })).toBe("2026-01-01")
  })

  it("renders dd/MM/yyyy for a SQL DATE", () => {
    expect(formatUserDate("2026-01-31", { dateFormat: "dd/MM/yyyy" })).toBe("31/01/2026")
  })

  it.each(["2026-13-01", "2026-02-30", "2026-00-01", "2026-01-32"])(
    "rejects shape-valid SQL DATEs that don't represent a real day (%s)",
    (badDate) => {
      // Without the round-trip validation, Date() silently rolls
      // 2026-13-01 to 2027-01-01 and 2026-02-30 to 2026-03-02. The
      // helper must return "" rather than render fabricated dates.
      expect(formatUserDate(badDate, { dateFormat: "yyyy-MM-dd" })).toBe("")
    }
  )
})

describe("formatUserDate — timezone-sensitive instants", () => {
  // 2026-01-01T05:30:00Z is Dec 31 at 21:30 in Pacific (PST, UTC-8) and
  // Jan 1 at 00:30 in Eastern (EST, UTC-5). Verifies that the helper
  // derives the calendar date in the user's zone, not the host's.
  const lateUtc = new Date("2026-01-01T05:30:00Z")

  it("renders 12/31/2025 for America/Los_Angeles", () => {
    expect(
      formatUserDate(lateUtc, { dateFormat: "MM/dd/yyyy", timeZone: "America/Los_Angeles" })
    ).toBe("12/31/2025")
  })

  it("renders 01/01/2026 for America/New_York", () => {
    expect(
      formatUserDate(lateUtc, { dateFormat: "MM/dd/yyyy", timeZone: "America/New_York" })
    ).toBe("01/01/2026")
  })

  it("renders 01/01/2026 for Asia/Tokyo (UTC+9)", () => {
    expect(formatUserDate(lateUtc, { dateFormat: "MM/dd/yyyy", timeZone: "Asia/Tokyo" })).toBe(
      "01/01/2026"
    )
  })
})

describe("formatUserDate — accepts numeric epoch + ISO string", () => {
  it("accepts an epoch number", () => {
    const epoch = Date.parse("2026-05-14T18:00:00Z")
    expect(formatUserDate(epoch, { dateFormat: "yyyy-MM-dd", timeZone: "America/Chicago" })).toBe(
      "2026-05-14"
    )
  })
  it("accepts an ISO string", () => {
    expect(
      formatUserDate("2026-05-14T18:00:00Z", {
        dateFormat: "yyyy-MM-dd",
        timeZone: "America/Chicago",
      })
    ).toBe("2026-05-14")
  })
})

describe("formatUserDate — every timezone × every format renders something", () => {
  // Smoke test the matrix: catches any zone the helper can't resolve
  // (would throw via Intl) and any format an exhaustiveness check
  // missed. Not asserting the exact value — that lives in the
  // targeted tests above.
  const instant = new Date("2026-05-14T18:00:00Z")
  for (const timeZone of SUPPORTED_TIME_ZONES) {
    for (const dateFormat of SUPPORTED_DATE_FORMATS) {
      for (const locale of SUPPORTED_LOCALES) {
        it(`renders ${timeZone} × ${dateFormat} × ${locale}`, () => {
          const result = formatUserDate(instant, { dateFormat, timeZone, locale })
          // Must be a non-empty string in one of the supported shapes
          // — empty would be the "invalid" branch slipping past us.
          expect(result.length).toBeGreaterThan(0)
          expect(result).toMatch(/^[\d/-]+$/)
        })
      }
    }
  }
})

describe("formatUserDateTime", () => {
  it("returns just the date for a SQL DATE input", () => {
    // Date-only inputs have no real time component — synthesizing
    // `00:00 CST` would imply more precision than the source data.
    expect(formatUserDateTime("2026-05-14", { dateFormat: "MM/dd/yyyy" })).toBe("05/14/2026")
  })

  it("appends localized time + short zone for instants", () => {
    const instant = new Date("2026-05-14T18:00:00Z")
    const result = formatUserDateTime(instant, {
      dateFormat: "yyyy-MM-dd",
      timeZone: "America/Chicago",
      locale: "en-US",
    })
    // 18:00 UTC is 1:00 PM in Chicago (CDT in May). The exact zone
    // abbreviation is locale + ICU dependent — check the date prefix
    // and the time digits, not the abbreviation.
    expect(result.startsWith("2026-05-14 ")).toBe(true)
    expect(result).toMatch(/1:00/)
  })

  it("returns empty string for invalid input", () => {
    expect(formatUserDateTime(null)).toBe("")
    expect(formatUserDateTime(undefined)).toBe("")
    expect(formatUserDateTime("nope")).toBe("")
  })
})

describe("formatInUserTimeZone", () => {
  it("forwards Intl options while injecting the user's timeZone + locale", () => {
    const instant = new Date("2026-05-14T18:00:00Z")
    const result = formatInUserTimeZone(
      instant,
      { timeZone: "America/Chicago", locale: "en-US" },
      { weekday: "short", month: "short", day: "numeric" }
    )
    // "Thu, May 14" — comma + space pattern depends on the locale.
    expect(result).toMatch(/May/)
    expect(result).toMatch(/14/)
  })

  it("falls back to defaults when no preferences are passed", () => {
    const instant = new Date("2026-05-14T18:00:00Z")
    const result = formatInUserTimeZone(instant, undefined, { hour: "numeric", minute: "2-digit" })
    // Chicago is UTC-5 in May → 1:00 PM.
    expect(result).toMatch(/1:00/)
  })

  it.each([null, undefined, "", "not a date", Number.NaN, new Date(Number.NaN)] as const)(
    "returns empty string for %p",
    (value) => {
      expect(formatInUserTimeZone(value)).toBe("")
    }
  )
})

describe("formatUserDateTime — every dateFormat propagates", () => {
  // Pin that the date-only branch picks up the user's chosen format,
  // not just the default "MM/dd/yyyy". Same shape parameters as
  // formatUserDate's matrix.
  it.each(SUPPORTED_DATE_FORMATS)(
    "renders SQL DATEs in %s without a synthesized time",
    (dateFormat) => {
      const expected =
        dateFormat === "MM/dd/yyyy"
          ? "05/14/2026"
          : dateFormat === "dd/MM/yyyy"
            ? "14/05/2026"
            : "2026-05-14"
      expect(formatUserDateTime("2026-05-14", { dateFormat })).toBe(expected)
    }
  )
})
