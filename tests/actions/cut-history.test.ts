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
    requireActiveSubscriptionMock.mockResolvedValue({ kind: "allowed" })
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
      expect(result.csv).toBe(
        "Cut Date,Part Type,Stock (W×L×T),Qty,Parts Done,Mat Used (ft²),Reuse (ft²),Scrap (ft²),Fab Score"
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
    expect(row).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},Rectangle,/)
    expect(row).toContain(`"60"" × 240"" × 0.5"""`)
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
    expect(result.csv).toContain(`"60"" × 240"" × 0.5"""`)
    expect(result.csv).toContain("Part 999")
  })

  it("surfaces service errors", async () => {
    bindServiceReturning(null, "connection refused")
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    await expect(exportCutHistoryCsv({ cutIds: [CUT_ID_1] })).rejects.toThrow(
      /connection refused/
    )
  })

  it("threads cutIds through to the service unchanged", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")
    await exportCutHistoryCsv({ cutIds: [CUT_ID_1, CUT_ID_2] })

    expect(getCutHistoryRowsForExportMock).toHaveBeenCalledWith(DB_SENTINEL, [
      CUT_ID_1,
      CUT_ID_2,
    ])
  })

  it("rejects non-UUID cutIds via Zod", async () => {
    bindServiceReturning([])
    const { exportCutHistoryCsv } = await import("@/app/actions/cut-history")

    await expect(exportCutHistoryCsv({ cutIds: ["not-a-uuid"] })).rejects.toThrow()
    expect(getCutHistoryRowsForExportMock).not.toHaveBeenCalled()
  })
})
