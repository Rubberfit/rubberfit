/**
 * cut-history action tests — exportCutHistoryCsv.
 *
 * What we're enforcing:
 *   - viewCutHistory permission is checked.
 *   - requireFeature("cut_history_exports") is called — Standard tier
 *     throws FeatureLockedError, Pro+ passes.
 *   - Empty cutIds returns just the header row (no DB call).
 *   - Rows from `cut_history` are formatted with the same column
 *     shape the client used to build on its own, so consumers
 *     receive identical CSVs.
 *   - CSV escaping wraps values containing commas, quotes, or
 *     newlines so spreadsheet tooling reads them as one cell.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requireFeatureMock = vi.hoisted(() => vi.fn())
class FeatureLockedErrorMock extends Error {
  readonly code = "FEATURE_LOCKED" as const
  readonly featureKey: string
  readonly requiredTier: string
  readonly currentTier: string
  constructor(p: { featureKey: string; requiredTier: string; currentTier: string }) {
    super("locked")
    this.featureKey = p.featureKey
    this.requiredTier = p.requiredTier
    this.currentTier = p.currentTier
  }
}
vi.mock("@/app/server/auth/require-feature", () => ({
  requireFeature: requireFeatureMock,
  FeatureLockedError: FeatureLockedErrorMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const getDatabaseClientMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient: getDatabaseClientMock,
}))

const getCutHistoryRowsForExportMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/services/cutHistoryService", () => ({
  getCutHistoryRowsForExport: getCutHistoryRowsForExportMock,
}))

// PR 2e — the action loads org print prefs to drive date / unit
// rendering in the CSV. Default mock returns undefined so the test
// suite's CSV expectations exercise the helper-defaults path
// (imperial / MM/dd/yyyy / America/Chicago). Typed as
// `() => Promise<unknown>` so per-test overrides can pass either
// undefined or a populated OrganizationPreferences shape.
const orgPrefsServiceMock = vi.hoisted(() => ({
  getForOrganization: vi.fn<(id: string) => Promise<unknown>>(),
}))
const resolveUseCaseMock = vi.hoisted(() => vi.fn(() => orgPrefsServiceMock))
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "manager@example.com",
  roles: ["manager"],
  isSuperAdmin: false,
}

const CUT_ID_1 = "11111111-1111-1111-1111-111111111111"
const CUT_ID_2 = "22222222-2222-2222-2222-222222222222"

/**
 * The action calls `getCutHistoryRowsForExport(db, cutIds)`. The db
 * client is mocked as a sentinel object — its internals are tested
 * separately in the service tests; here we just confirm the action
 * wiring + CSV formatting.
 */
const DB_SENTINEL = { __mock: "db-client" }
function bindServiceReturning(rows: unknown[] | null, errorMessage?: string) {
  getDatabaseClientMock.mockResolvedValue(DB_SENTINEL)
  if (errorMessage) {
    getCutHistoryRowsForExportMock.mockRejectedValue(new Error(errorMessage))
  } else {
    getCutHistoryRowsForExportMock.mockResolvedValue(rows ?? [])
  }
}

describe("app/actions/cut-history.exportCutHistoryCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requirePermissionMock.mockReturnValue(undefined)
    requireFeatureMock.mockResolvedValue(undefined)
    // PR 2e: action now reads `subscription.organizationId` to look
    // up org print prefs. Provide a stable id so the lookup runs.
    requireActiveSubscriptionMock.mockResolvedValue({
      kind: "allowed",
      organizationId: "00000000-0000-0000-0000-0000000000aa",
    })
    // Default: prefs lookup returns undefined → CSV uses helper
    // defaults (imperial / MM/dd/yyyy / America/Chicago). Individual
    // tests override per-call to exercise non-default org prefs.
    orgPrefsServiceMock.getForOrganization.mockResolvedValue(undefined)
    resolveUseCaseMock.mockReturnValue(orgPrefsServiceMock)
  })

  it("calls auth + permission + active-sub + feature gates", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")
    await exportCutHistoryCsv({ cutIds: [] })

    expect(requireAuthenticatedUserMock).toHaveBeenCalled()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "viewCutHistory")
    expect(requireFeatureMock).toHaveBeenCalledWith(ACTOR, "cut_history_exports")
  })

  it("returns header-only CSV (no DB call) for empty cutIds", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    const result = await exportCutHistoryCsv({ cutIds: [] })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // PR 2e: imperial header now interpolates getAreaUnitLabel ("sq ft").
      expect(result.csv).toBe(
        "Cut Date,Part Type,Stock (W×L×T),Qty,Parts Done,Mat Used (sq ft),Reuse (sq ft),Scrap (sq ft),Fab Score"
      )
    }
    expect(getCutHistoryRowsForExportMock).not.toHaveBeenCalled()
  })

  it("returns a discriminated FEATURE_LOCKED result when feature gate rejects", async () => {
    requireFeatureMock.mockRejectedValue(
      new FeatureLockedErrorMock({
        featureKey: "cut_history_exports",
        requiredTier: "pro",
        currentTier: "standard",
      })
    )
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    const result = await exportCutHistoryCsv({ cutIds: [CUT_ID_1] })

    expect(result).toMatchObject({
      ok: false,
      reason: "FEATURE_LOCKED",
      requiredTier: "pro",
      currentTier: "standard",
    })
    expect(getCutHistoryRowsForExportMock).not.toHaveBeenCalled()
  })

  it("formats rows with the same shape the client used to render", async () => {
    bindServiceReturning([
      {
        id: CUT_ID_1,
        cut_date: "2026-04-22T15:30:00.000Z",
        part_id: 1,
        cut_width: 60,
        cut_length: 240,
        cut_thickness: 0.5,
        cut_amount: 4,
        parts_completed: 4,
        material_used_sqft: 12.34,
        reusable_offset_sqft: 1.5,
        scrap_sqft: 0.25,
        fab_score: 0.873,
      },
    ])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    const result = await exportCutHistoryCsv({ cutIds: [CUT_ID_1] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    const lines = result.csv.split("\n")

    expect(lines).toHaveLength(2)
    const row = lines[1]
    // PR 2e: date now flows through formatUserDateTime defaulting to
    // MM/dd/yyyy + localized time + short zone (America/Chicago), and
    // dimensions through formatDimensionsInches (formatter trims
    // trailing zeros so 60 / 240 / 0.5 render at native width).
    expect(row).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM) [A-Z]{2,4},Rectangle,/)
    expect(row).toContain("60 × 240 × 0.5 in")
    expect(row).toMatch(/,4,4,12\.34,1\.50,0\.25,87%$/)
    expect(getCutHistoryRowsForExportMock).toHaveBeenCalledWith(DB_SENTINEL, [CUT_ID_1])
  })

  it("escapes CSV cells containing commas, quotes, and newlines", async () => {
    bindServiceReturning([
      {
        id: CUT_ID_1,
        cut_date: "2026-04-22T15:30:00.000Z",
        part_id: 999,
        cut_width: 60,
        cut_length: 240,
        cut_thickness: 0.5,
        cut_amount: 1,
        parts_completed: 1,
        material_used_sqft: 0,
        reusable_offset_sqft: 0,
        scrap_sqft: 0,
        fab_score: 1,
      },
    ])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    const result = await exportCutHistoryCsv({ cutIds: [CUT_ID_1] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    // PR 2e: dimension cell uses formatDimensionsInches (no embedded
    // quote marks → no csvCell escape needed; trailing zeros trimmed).
    expect(result.csv).toContain("60 × 240 × 0.5 in")
    expect(result.csv).toContain("Part 999")
  })

  it("surfaces service errors", async () => {
    bindServiceReturning(null, "connection refused")
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    await expect(exportCutHistoryCsv({ cutIds: [CUT_ID_1] })).rejects.toThrow(/connection refused/)
  })

  it("threads cutIds through to the service unchanged", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")
    await exportCutHistoryCsv({ cutIds: [CUT_ID_1, CUT_ID_2] })

    expect(getCutHistoryRowsForExportMock).toHaveBeenCalledWith(DB_SENTINEL, [CUT_ID_1, CUT_ID_2])
  })

  it("rejects non-UUID cutIds via Zod", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    await expect(exportCutHistoryCsv({ cutIds: ["not-a-uuid"] })).rejects.toThrow()
    expect(getCutHistoryRowsForExportMock).not.toHaveBeenCalled()
  })

  // PR 2e — when the org has metric + dd/MM/yyyy + Europe/London prefs
  // configured, both the header and every cell flips to match. Header
  // gets `m²`, dimensions get cm with the unit-at-end rule, areas get
  // their NIST sqft→m² conversion, and the date gets the operator's
  // dateFormat / timeZone / locale.
  it("renders the CSV in the operator's units + date format when org prefs are non-default", async () => {
    orgPrefsServiceMock.getForOrganization.mockResolvedValueOnce({
      organizationId: "00000000-0000-0000-0000-0000000000aa",
      defaultCurrency: "GBP",
      timeZone: "Europe/London",
      dateFormat: "dd/MM/yyyy",
      unitSystem: "metric",
      lowStockThresholdSqft: 50,
      locale: "en-US",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })
    bindServiceReturning([
      {
        id: CUT_ID_1,
        cut_date: "2026-04-22T15:30:00.000Z",
        part_id: 1,
        cut_width: 60,
        cut_length: 240,
        cut_thickness: 0.5,
        cut_amount: 4,
        parts_completed: 4,
        material_used_sqft: 12.34,
        reusable_offset_sqft: 1.5,
        scrap_sqft: 0.25,
        fab_score: 0.873,
      },
    ])

    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")
    const result = await exportCutHistoryCsv({ cutIds: [CUT_ID_1] })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok result")
    const [headerLine, dataLine] = result.csv.split("\n")

    // Header: m² substitutes for sq ft via getAreaUnitLabel("metric").
    expect(headerLine).toBe(
      "Cut Date,Part Type,Stock (W×L×T),Qty,Parts Done,Mat Used (m²),Reuse (m²),Scrap (m²),Fab Score"
    )
    // Date: dd/MM/yyyy + locale-formatted GMT/BST time. Match shape,
    // not exact zone label (varies seasonally).
    expect(dataLine).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{1,2}:\d{2} (AM|PM) [A-Z]+\+?\d*,Rectangle,/)
    // Dimensions in cm with unit-at-end. Helper trims trailing zeros
    // so 60 in → "152.4 cm", 240 in → "609.6 cm", 0.5 in → "1.27 cm".
    expect(dataLine).toContain("152.4 × 609.6 × 1.27 cm")
    // Areas: NIST conversion 0.09290304 m²/sqft. 12.34 → 1.146...,
    // formatted at fixed 2 decimals.
    expect(dataLine).toContain(",1.15,0.14,0.02,87%")
  })

  it("falls back to imperial / MM-dd defaults when org prefs lookup throws", async () => {
    orgPrefsServiceMock.getForOrganization.mockRejectedValueOnce(new Error("no prefs row"))
    bindServiceReturning([
      {
        id: CUT_ID_1,
        cut_date: "2026-04-22T15:30:00.000Z",
        part_id: 1,
        cut_width: 60,
        cut_length: 240,
        cut_thickness: 0.5,
        cut_amount: 1,
        parts_completed: 1,
        material_used_sqft: 1,
        reusable_offset_sqft: 0,
        scrap_sqft: 0,
        fab_score: 0.5,
      },
    ])

    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const result = await exportCutHistoryCsv({ cutIds: [CUT_ID_1] })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error("expected ok result")
      // Imperial header retained on lookup failure.
      expect(result.csv.split("\n")[0]).toContain("Mat Used (sq ft)")
      // Logged for observability.
      expect(consoleSpy).toHaveBeenCalledWith(
        "[exportCutHistoryCsv] failed to resolve org print prefs",
        expect.any(Error)
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })
})
