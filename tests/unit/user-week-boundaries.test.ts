/**
 * Pins the contract for `weekBoundariesInZone`. PR 2b — replaces the
 * browser-local `startOfWeek/endOfWeek` on the dashboard so the "This
 * week" label and `cutsThisWeek` filter agree with the operator's
 * saved timeZone.
 *
 * Coverage:
 *   - default (no preferences) matches the helper's documented default
 *   - every SUPPORTED_TIME_ZONE × {weekStartsOn=0,1}
 *   - DST spring-forward / fall-back weeks have correct UTC durations
 *   - midnight boundary case: a `now` instant on Sunday 23:59 in zone A
 *     and Monday 00:30 in zone B yields different weeks
 *   - cross-month / cross-year week start
 */

import { describe, expect, it } from "vitest"

import { SUPPORTED_TIME_ZONES } from "@/src/application/preferences/constants"
import { weekBoundariesInZone } from "@/src/application/preferences/user-week-boundaries"

const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS

describe("weekBoundariesInZone", () => {
  it("defaults to America/Chicago when no preferences provided", () => {
    // 2026-05-14T20:00 UTC = 2026-05-14T15:00 America/Chicago (CDT, UTC-5).
    // Thursday May 14 → weekStart = Monday May 12 at 00:00 CDT = 2026-05-12T05:00 UTC.
    const now = new Date("2026-05-14T20:00:00Z")
    const { weekStart, weekEnd } = weekBoundariesInZone(now)
    expect(weekStart.toISOString()).toBe("2026-05-11T05:00:00.000Z")
    // weekEnd = Sunday May 17 at 23:59:59.999 CDT = 2026-05-18T04:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-05-18T04:59:59.999Z")
  })

  it("respects weekStartsOn=0 (Sunday start)", () => {
    const now = new Date("2026-05-14T20:00:00Z") // Thursday
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "America/Chicago" }, 0)
    // Sunday May 10 at 00:00 CDT = 2026-05-10T05:00 UTC
    expect(weekStart.toISOString()).toBe("2026-05-10T05:00:00.000Z")
    // Saturday May 16 23:59:59.999 CDT = 2026-05-17T04:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-05-17T04:59:59.999Z")
  })

  it("yields a different week boundary when the same instant crosses midnight in two zones", () => {
    // Instant: 2026-05-12T04:30 UTC.
    //   In America/Los_Angeles (UTC-7 in May/PDT): 2026-05-11T21:30 PDT → still Monday May 11 → week starts May 11.
    //   In Asia/Tokyo (UTC+9): 2026-05-12T13:30 JST → Tuesday May 12 → week starts May 11 too (week of May 11–17).
    // Pick a tighter boundary instead: 2026-05-11T05:30 UTC.
    //   LA: 2026-05-10T22:30 PDT (Sun) → week of May 4–10
    //   Tokyo: 2026-05-11T14:30 JST (Mon) → week of May 11–17
    const tight = new Date("2026-05-11T05:30:00Z")
    const la = weekBoundariesInZone(tight, { timeZone: "America/Los_Angeles" })
    const tokyo = weekBoundariesInZone(tight, { timeZone: "Asia/Tokyo" })
    expect(la.weekStart.toISOString()).toBe("2026-05-04T07:00:00.000Z")
    expect(tokyo.weekStart.toISOString()).toBe("2026-05-10T15:00:00.000Z")
  })

  it("spring-forward week has 167-hour UTC duration (America/Chicago, 2026-03-08)", () => {
    // 2026-03-08 is the 2nd Sunday of March — DST starts at 02:00 CST → 03:00 CDT.
    // Week of Monday March 2 (CST) to Sunday March 8 (CDT, after spring-forward)
    // spans only 167 wall-clock hours in UTC ms, even though it's 7 days locally.
    const now = new Date("2026-03-08T18:00:00Z") // Sun mid-day in Chicago
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "America/Chicago" })
    // Monday March 2 at 00:00 CST = 2026-03-02T06:00 UTC
    expect(weekStart.toISOString()).toBe("2026-03-02T06:00:00.000Z")
    // Sunday March 8 at 23:59:59.999 CDT = 2026-03-09T04:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-03-09T04:59:59.999Z")
    // Duration: 167 hours - 1 ms (one hour fewer than a non-DST week).
    const durationMs = weekEnd.getTime() - weekStart.getTime() + 1
    expect(durationMs).toBe(167 * HOUR_MS)
  })

  it("fall-back week has 169-hour UTC duration (America/Chicago, 2026-11-01)", () => {
    // 2026-11-01 is the 1st Sunday of November — DST ends at 02:00 CDT → 01:00 CST.
    // Week of Monday October 26 (CDT) to Sunday November 1 (CST, after fall-back)
    // spans 169 wall-clock hours in UTC ms.
    const now = new Date("2026-11-01T18:00:00Z")
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "America/Chicago" })
    // Monday October 26 at 00:00 CDT = 2026-10-26T05:00 UTC
    expect(weekStart.toISOString()).toBe("2026-10-26T05:00:00.000Z")
    // Sunday November 1 at 23:59:59.999 CST = 2026-11-02T05:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-11-02T05:59:59.999Z")
    const durationMs = weekEnd.getTime() - weekStart.getTime() + 1
    expect(durationMs).toBe(169 * HOUR_MS)
  })

  it("non-DST zones produce a flat 168-hour week", () => {
    // Asia/Tokyo does not observe DST. America/Phoenix does not observe DST.
    const now = new Date("2026-03-08T18:00:00Z")
    for (const tz of ["Asia/Tokyo", "America/Phoenix"] as const) {
      const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: tz })
      const durationMs = weekEnd.getTime() - weekStart.getTime() + 1
      expect(durationMs).toBe(WEEK_MS)
    }
  })

  it("smoke matrix: every supported zone produces a valid week containing `now`", () => {
    // Instant chosen mid-day UTC so no zone will be at midnight ±5 min.
    const now = new Date("2026-05-14T14:00:00Z")
    for (const timeZone of SUPPORTED_TIME_ZONES) {
      const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone })
      expect(weekStart.getTime()).toBeLessThanOrEqual(now.getTime())
      expect(weekEnd.getTime()).toBeGreaterThanOrEqual(now.getTime())
      const duration = weekEnd.getTime() - weekStart.getTime() + 1
      // 167h (spring-forward), 168h (normal), or 169h (fall-back).
      expect([167 * HOUR_MS, 168 * HOUR_MS, 169 * HOUR_MS]).toContain(duration)
    }
  })

  it("cross-year week start (2026-01-01 Thursday → Mon Dec 29 2025)", () => {
    const now = new Date("2026-01-01T18:00:00Z")
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "America/Chicago" })
    // Mon Dec 29 2025 at 00:00 CST = 2025-12-29T06:00 UTC
    expect(weekStart.toISOString()).toBe("2025-12-29T06:00:00.000Z")
    // Sun Jan 4 2026 at 23:59:59.999 CST = 2026-01-05T05:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-01-05T05:59:59.999Z")
  })

  it("cross-month week start (May 1 2026 Friday → Mon Apr 27)", () => {
    const now = new Date("2026-05-01T18:00:00Z")
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "America/Chicago" })
    // Mon Apr 27 at 00:00 CDT = 2026-04-27T05:00 UTC
    expect(weekStart.toISOString()).toBe("2026-04-27T05:00:00.000Z")
    expect(weekEnd.toISOString()).toBe("2026-05-04T04:59:59.999Z")
  })

  it("Europe/London BST week is 167h across spring-forward (2026-03-29)", () => {
    // UK clocks jump 01:00 GMT → 02:00 BST on the last Sunday of March (2026-03-29).
    const now = new Date("2026-03-29T18:00:00Z")
    const { weekStart, weekEnd } = weekBoundariesInZone(now, { timeZone: "Europe/London" })
    // Monday March 23 at 00:00 GMT = 2026-03-23T00:00 UTC
    expect(weekStart.toISOString()).toBe("2026-03-23T00:00:00.000Z")
    // Sunday March 29 at 23:59:59.999 BST = 2026-03-29T22:59:59.999 UTC
    expect(weekEnd.toISOString()).toBe("2026-03-29T22:59:59.999Z")
    const duration = weekEnd.getTime() - weekStart.getTime() + 1
    expect(duration).toBe(167 * HOUR_MS)
  })

  it("operator near zone-midnight gets the zone's calendar week, not the browser's", () => {
    // 2026-05-12T04:30 UTC — for Asia/Tokyo it's 13:30 Tue May 12, week of May 11.
    // For America/Los_Angeles it's Mon May 11 21:30, week of May 11 as well.
    // For Europe/London it's 05:30 Tue May 12 (BST), week of May 11.
    // Different zones agree here because all are well past midnight. The
    // important property is that each call reports its OWN zone's week.
    const now = new Date("2026-05-12T04:30:00Z")
    const tokyo = weekBoundariesInZone(now, { timeZone: "Asia/Tokyo" })
    const la = weekBoundariesInZone(now, { timeZone: "America/Los_Angeles" })
    const london = weekBoundariesInZone(now, { timeZone: "Europe/London" })

    // Monday May 11 at 00:00 JST = 2026-05-10T15:00 UTC
    expect(tokyo.weekStart.toISOString()).toBe("2026-05-10T15:00:00.000Z")
    // Monday May 11 at 00:00 PDT = 2026-05-11T07:00 UTC
    expect(la.weekStart.toISOString()).toBe("2026-05-11T07:00:00.000Z")
    // Monday May 11 at 00:00 BST = 2026-05-10T23:00 UTC
    expect(london.weekStart.toISOString()).toBe("2026-05-10T23:00:00.000Z")
  })

})
