/**
 * Regression tests for GitHub issue #122 — "Export button not working on the
 * dashboard". The Operations overview Export button on `app/dashboard/page.tsx`
 * had no `onClick` handler, so clicking it did nothing.
 *
 * The fix wires the button to a CSV+PDF dropdown backed by two pure helpers:
 *   - `buildOperationsCsv(input)`  → ExportData for `exportService.exportToCSV`
 *   - `buildOperationsPdfHtml(input)` → { title, content } for
 *                                       `exportPdfService.generatePDFReport`
 *
 * These tests pin the helper output shapes so future refactors don't silently
 * break the export contract.
 */
import { describe, expect, it } from "vitest"

import {
  buildOperationsCsv,
  buildOperationsPdfHtml,
  type OperationsExportInput,
} from "@/app/dashboard/_components/dashboard-export-utils"

const FIXTURE: OperationsExportInput = {
  period: "week",
  weekLabel: "Apr 21 – Apr 27",
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
    {
      id: "2",
      jobCode: "CUT-0002",
      operator: "Steven",
      utilizationPct: 92.0,
      whenLabel: "yesterday",
    },
  ],
}

describe("buildOperationsCsv", () => {
  it("returns a stable header pair and a period-scoped filename", () => {
    const result = buildOperationsCsv(FIXTURE)
    expect(result.headers).toEqual(["Metric", "Value"])
    expect(result.filename).toBe("operations-overview_week")
  })

  it("emits the four headline summary metrics", () => {
    const { rows } = buildOperationsCsv(FIXTURE)
    const flat = rows.map((r) => r.join("|"))
    expect(flat).toContain("Active rolls|42")
    expect(flat).toContain("Cuts this week|7")
    expect(flat).toContain("Avg waste %|12.3")
    // formatCurrency drops fractional cents and prefixes $
    expect(flat.some((r) => r.startsWith("Inventory value|$"))).toBe(true)
  })

  it("includes the utilization series labelled with the active util period", () => {
    const { rows } = buildOperationsCsv(FIXTURE)
    const headerIdx = rows.findIndex(
      (r) => typeof r[0] === "string" && r[0].includes("Utilization (7d)")
    )
    expect(headerIdx).toBeGreaterThan(-1)
    // The bucket header row sits two rows after, then the data rows follow.
    expect(rows[headerIdx + 1]).toEqual(["Bucket", "EPDM 60A", "Neoprene"])
    expect(rows[headerIdx + 2]).toEqual(["Mon", 12.4, 3.1])
    expect(rows[headerIdx + 3]).toEqual(["Tue", 0, 8.7])
  })

  it("appends the recent cuts table with the four expected columns", () => {
    const { rows } = buildOperationsCsv(FIXTURE)
    const headerIdx = rows.findIndex((r) => r[0] === "Job code" && r[1] === "Operator")
    expect(headerIdx).toBeGreaterThan(-1)
    expect(rows[headerIdx]).toEqual(["Job code", "Operator", "Utilization %", "When"])
    expect(rows[headerIdx + 1]).toEqual(["CUT-0001", "Daniel", 87.5, "2h ago"])
  })

  it("scopes the filename to the selected period", () => {
    expect(buildOperationsCsv({ ...FIXTURE, period: "month" }).filename).toBe(
      "operations-overview_month"
    )
    expect(buildOperationsCsv({ ...FIXTURE, period: "quarter" }).filename).toBe(
      "operations-overview_quarter"
    )
  })

  it("falls back to zeroes when a utilization datum is missing a material key", () => {
    const partial: OperationsExportInput = {
      ...FIXTURE,
      utilization: {
        series: [{ label: "Mon", "EPDM 60A": 5 }],
        materials: ["EPDM 60A", "Neoprene"],
      },
    }
    const { rows } = buildOperationsCsv(partial)
    const dataRow = rows.find((r) => r[0] === "Mon")
    expect(dataRow).toEqual(["Mon", 5, 0])
  })
})

describe("buildOperationsPdfHtml", () => {
  it("uses the Operations overview title", () => {
    const { title } = buildOperationsPdfHtml(FIXTURE)
    expect(title).toBe("Operations overview")
  })

  it("embeds the four summary metric cards and active util period", () => {
    const { content } = buildOperationsPdfHtml(FIXTURE)
    expect(content).toContain("<h1>Operations overview</h1>")
    expect(content).toContain("Active rolls")
    expect(content).toContain("Cuts this week")
    expect(content).toContain("Avg waste")
    expect(content).toContain("Inventory value")
    expect(content).toContain("Utilization (7d)")
    // Numbers from the fixture surface in the rendered HTML.
    expect(content).toContain(">42<")
    expect(content).toContain(">7<")
    expect(content).toContain("12.3%")
  })

  it("renders empty-state placeholders instead of empty tables", () => {
    const empty: OperationsExportInput = {
      ...FIXTURE,
      utilization: { series: [], materials: [] },
      recentCuts: [],
    }
    const { content } = buildOperationsPdfHtml(empty)
    expect(content).toContain("No utilization data in window.")
    expect(content).toContain("No recent cuts.")
    expect(content).not.toContain("<tbody>")
  })

  it("escapes HTML in user-controlled fields (operator, weekLabel, materials)", () => {
    const malicious: OperationsExportInput = {
      ...FIXTURE,
      weekLabel: 'Apr 21 – Apr 27 <script>alert("x")</script>',
      utilization: {
        series: [{ label: "Mon", "<b>Hax</b>": 1 }],
        materials: ["<b>Hax</b>"],
      },
      recentCuts: [
        {
          id: "1",
          jobCode: "CUT-<i>0001</i>",
          operator: "<img onerror=x>",
          utilizationPct: 50,
          whenLabel: "now",
        },
      ],
    }
    const { content } = buildOperationsPdfHtml(malicious)
    expect(content).not.toContain("<script>alert")
    expect(content).not.toContain("<img onerror=x>")
    expect(content).not.toContain("<b>Hax</b>")
    expect(content).toContain("&lt;script&gt;")
    expect(content).toContain("&lt;img onerror=x&gt;")
    expect(content).toContain("&lt;b&gt;Hax&lt;/b&gt;")
  })
})
