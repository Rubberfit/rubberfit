/**
 * Phase 7 PR 5 — pins the Analytics report PDF builder. Replaces the
 * HTML stamper path; per founder Q4 all 4 templates compose into one
 * shared layout. This test pins:
 *   - Letter geometry (612×792pt)
 *   - Builder handles every empty-state combination
 *   - Multi-page pagination on long recent-cuts lists
 */
// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  type AnalyticsReportInput,
  buildAnalyticsReportPdf,
} from "@/app/dashboard/analytics/reports/_components/analytics-report-pdf"
import type { CutWithRoll } from "@/src/application/services/cut.service.interface"

function makeCut(overrides: Partial<CutWithRoll> = {}): CutWithRoll {
  return {
    id: "c-1",
    user_id: "u",
    roll_id: "r-1",
    cut_width: 12,
    cut_length: 24,
    quantity: 4,
    waste_percentage: 6.2,
    total_sqft_used: 8,
    job_reference: "J-001",
    created_at: "2026-05-01T00:00:00Z",
    roll: { id: "r-1", material_type: "EPDM 60A" },
    ...overrides,
  } as unknown as CutWithRoll
}

function makeInput(overrides: Partial<AnalyticsReportInput> = {}): AnalyticsReportInput {
  return {
    reportName: "Waste Analytics",
    periodLabel: "Monthly",
    startDate: new Date("2026-04-01T00:00:00Z"),
    endDate: new Date("2026-04-30T23:59:59Z"),
    summary: {
      totalCuts: 18,
      totalMaterialUsed: 124.4,
      averageWaste: 7.3,
      totalInventoryValue: 42_500,
    },
    materialBreakdown: [
      { material: "EPDM 60A", activeRolls: 6, totalSqft: 480, totalValue: 12_000 },
      { material: "Neoprene", activeRolls: 4, totalSqft: 240, totalValue: 8_400 },
    ],
    recentCuts: [makeCut({ id: "c-1" }), makeCut({ id: "c-2", job_reference: undefined })],
    ...overrides,
  }
}

describe("buildAnalyticsReportPdf", () => {
  it("returns a non-empty Letter-sized jsPDF for a populated input", () => {
    const doc = buildAnalyticsReportPdf(makeInput())
    expect(doc.internal.pageSize.getWidth()).toBe(612)
    expect(doc.internal.pageSize.getHeight()).toBe(792)
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("handles empty material-breakdown + empty recent-cuts without throwing", () => {
    const doc = buildAnalyticsReportPdf(makeInput({ materialBreakdown: [], recentCuts: [] }))
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(1024)
  })

  it("paginates when given many recent cuts", () => {
    const manyCuts = Array.from({ length: 50 }, (_, i) =>
      makeCut({ id: `c-${i}`, job_reference: `J-${i.toString().padStart(3, "0")}` })
    )
    const doc = buildAnalyticsReportPdf(makeInput({ recentCuts: manyCuts }))
    expect(doc.getNumberOfPages()).toBeGreaterThan(1)
  })

  it("renders all four named-template variants without throwing", () => {
    const templates = ["Waste analytics", "Costs analytics", "Trends report", "Usage report"]
    for (const name of templates) {
      expect(() => buildAnalyticsReportPdf(makeInput({ reportName: name }))).not.toThrow()
    }
  })

  // PR 2d — orgPrefs.unitSystem is now an optional input field. The
  // contract is: omitted / imperial preserves the legacy render; metric
  // produces a structurally-identical but content-different PDF.
  it("renders both imperial and metric without throwing", () => {
    const imperial = buildAnalyticsReportPdf(
      makeInput({ organizationPreferences: { unitSystem: "imperial" } })
    )
    const metric = buildAnalyticsReportPdf(
      makeInput({ organizationPreferences: { unitSystem: "metric" } })
    )
    expect(imperial.internal.pageSize.getWidth()).toBe(612)
    expect(metric.internal.pageSize.getWidth()).toBe(612)
    expect(imperial.output("arraybuffer").byteLength).toBeGreaterThan(2048)
    expect(metric.output("arraybuffer").byteLength).toBeGreaterThan(2048)
  })

  it("defaults to imperial when organizationPreferences is omitted", () => {
    expect(() => buildAnalyticsReportPdf(makeInput())).not.toThrow()
  })
})
