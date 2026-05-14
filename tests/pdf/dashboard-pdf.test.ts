/**
 * Phase 7 PR 2 — pins the Operations Overview (dashboard) PDF after
 * the mm→pt + shared-chrome refactor. Existing
 * `tests/exports/issue-122-operations-overview.test.ts` still owns
 * the click-through contract; this file pins the render contract:
 * A4 in points, multi-page pagination on big inputs, blob bytes.
 */
// @vitest-environment node
import jsPDF from "jspdf"
import { describe, expect, it, vi } from "vitest"

import {
  buildOperationsFooterDocMeta,
  buildOperationsPdf,
} from "@/app/dashboard/_components/dashboard-pdf"
import type { OperationsExportInput } from "@/app/dashboard/_components/dashboard-export-utils"
import { INTERNAL_PAGE, TYPE } from "@/app/lib/pdf"

function makeInput(overrides: Partial<OperationsExportInput> = {}): OperationsExportInput {
  return {
    period: "week",
    periodLabel: "Apr 21 – Apr 27",
    utilPeriod: "7d",
    totalActiveRolls: 42,
    cutsThisWeek: 7,
    wastePercentage: 12.345,
    inventoryValue: 18742,
    utilization: {
      series: [
        { label: "Mon", "EPDM 60A": 12.4, Neoprene: 3.1 },
        { label: "Tue", "EPDM 60A": 0, Neoprene: 8.7 },
      ],
      materials: ["EPDM 60A", "Neoprene"],
    },
    recentCuts: [
      {
        id: "1",
        jobCode: "CUT-0001",
        operator: "Daniel",
        utilizationPct: 87.5,
        whenLabel: "2h ago",
      },
    ],
    ...overrides,
  }
}

async function blobToBytes(blob: Blob): Promise<number> {
  const buffer = await blob.arrayBuffer()
  return buffer.byteLength
}

describe("buildOperationsPdf", () => {
  it("returns a non-empty Blob", async () => {
    const blob = buildOperationsPdf(makeInput())
    expect(blob.type).toBe("application/pdf")
    expect(await blobToBytes(blob)).toBeGreaterThan(2048)
  })

  it("renders empty utilization + recent-cuts sections without throwing", async () => {
    const blob = buildOperationsPdf(
      makeInput({
        utilization: { series: [], materials: [] },
        recentCuts: [],
      })
    )
    expect(await blobToBytes(blob)).toBeGreaterThan(1024)
  })

  it("paginates when given many recent cuts", async () => {
    const cuts = Array.from({ length: 80 }, (_, i) => ({
      id: `${i}`,
      jobCode: `CUT-${i.toString().padStart(4, "0")}`,
      operator: i % 2 === 0 ? "Daniel" : "Steven",
      utilizationPct: 80 + (i % 20),
      whenLabel: `${i}h ago`,
    }))
    const blob = buildOperationsPdf(makeInput({ recentCuts: cuts }))
    // Multi-page output is bigger than a single page — assert via byte
    // count growth, since `Blob` doesn't expose page metadata.
    const bytes = await blobToBytes(blob)
    const baseline = await blobToBytes(buildOperationsPdf(makeInput({ recentCuts: [] })))
    expect(bytes).toBeGreaterThan(baseline)
  })

  it("accepts non-default workspace preferences without throwing", async () => {
    // PR 2c (operator-seeds-prints): the footer renders in the
    // workspace's locale + dateFormat + timeZone, not the viewing
    // user's. Production uses canonical OrganizationPreferences;
    // here we only need the structural subset the helper consumes.
    const blob = buildOperationsPdf(
      makeInput({
        organizationPreferences: {
          dateFormat: "yyyy-MM-dd",
          timeZone: "Europe/London",
          locale: "es-MX",
        },
      })
    )
    expect(blob.type).toBe("application/pdf")
    expect(await blobToBytes(blob)).toBeGreaterThan(2048)
  })

  it("footer renders org prefs even when sibling user-prefs differ (operator-seeds-prints)", () => {
    // PR 2c dyad — viewer has en-US/America/Chicago/MM/dd/yyyy on
    // their personal screen; workspace defaults are
    // es-MX/Europe/London/yyyy-MM-dd. The exported PDF must speak
    // the workspace's voice. We assert by the footer docMeta —
    // sibling helper that does not depend on the in-PDF text
    // extraction, so the test runs in node without jsdom.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-12-31T23:59:00.000Z"))
      const orgWorldview = buildOperationsFooterDocMeta(
        makeInput({
          organizationPreferences: {
            dateFormat: "yyyy-MM-dd",
            timeZone: "Europe/London",
            locale: "es-MX",
          },
        })
      )
      const viewerWorldview = buildOperationsFooterDocMeta(
        makeInput({
          organizationPreferences: {
            dateFormat: "MM/dd/yyyy",
            timeZone: "America/Chicago",
            locale: "en-US",
          },
        })
      )
      // The dyad must produce visibly different output. If they
      // collide the org prefs aren't reaching the footer (caller
      // regression: someone passed user prefs where org prefs go).
      expect(orgWorldview).not.toBe(viewerWorldview)
      // Worst-case prefs render the worst-case form of yyyy-MM-dd.
      expect(orgWorldview).toMatch(/2026-12-31|2027-01-01/)
      // Viewer worldview renders the MM/dd/yyyy form in Chicago,
      // so the date components reorder.
      expect(viewerWorldview).toMatch(/12\/31\/2026/)
    } finally {
      vi.useRealTimers()
    }
  })

  it("footer docMeta fits the right-half width budget under worst-case prefs", () => {
    // PR 2b — CodeRabbit's deferred recommendation. Measures the
    // right-aligned footer string against the page's content width so
    // the docMeta can't silently overrun the centered page counter
    // under es-MX + Europe/London + yyyy-MM-dd (longest combo across
    // supported prefs). Caption type, single-line, no zone abbrev.
    //
    // Budget: contentWidth / 2 - 16pt. The footer has three columns
    // (left product mark, center page counter, right docMeta). Center
    // counter is ~50pt at caption-mono; the 16pt subtractive padding
    // keeps a clear gap from the center even at "Page 9 of 99".
    //
    // Fake clock pins the timestamp so the assertion can't drift
    // across midnight or DST transitions in CI. `buildOperationsFooter
    // DocMeta` reads `new Date()` internally; vi.setSystemTime feeds it
    // a constant. try/finally so a failing expect can't leak fake
    // timers into the remainder of the suite.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-12-31T23:59:00.000Z"))
      const worstCase: OperationsExportInput["organizationPreferences"] = {
        dateFormat: "yyyy-MM-dd",
        timeZone: "Europe/London",
        locale: "es-MX",
      }
      const periods: Array<OperationsExportInput["period"]> = ["week", "month", "quarter"]
      const doc = new jsPDF({ unit: "pt", format: "a4" })
      doc.setFont(TYPE.caption.family, TYPE.caption.weight)
      doc.setFontSize(TYPE.caption.size)
      const budget = INTERNAL_PAGE.contentWidth / 2 - 16
      for (const period of periods) {
        const docMeta = buildOperationsFooterDocMeta(
          makeInput({ organizationPreferences: worstCase, period })
        )
        const width = doc.getTextWidth(docMeta)
        // Embed the period + measured width in the assertion message so a
        // future regression report identifies which period overflowed.
        expect(
          width,
          `${period} footer "${docMeta}" measured ${width.toFixed(1)}pt vs budget ${budget.toFixed(1)}pt`
        ).toBeLessThan(budget)
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
