/**
 * Regression tests for GitHub issue #122 — "Export button not working on the
 * dashboard". The Operations overview Export button on `app/dashboard/page.tsx`
 * had no `onClick` handler, so clicking it did nothing.
 *
 * The fix wires the button to a CSV+PDF dropdown backed by two helpers:
 *   - `buildOperationsCsv(input)` (data shaper) → ExportData for
 *     `exportService.exportToCSV`
 *   - `buildOperationsPdf(input)` (jsPDF builder) → Blob, downloaded by
 *     `downloadOperationsPdf` from `dashboard-pdf.ts`
 *
 * These tests pin the helper output shapes so future refactors don't silently
 * break the export contract.
 */
import { describe, expect, it } from "vitest"

import {
  buildOperationsCsv,
  type OperationsExportInput,
} from "@/app/dashboard/_components/dashboard-export-utils"
import { buildOperationsPdf } from "@/app/dashboard/_components/dashboard-pdf"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"

const FIXTURE: OperationsExportInput = {
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
    {
      id: "2",
      jobCode: "CUT-0002",
      operator: "Steven",
      utilizationPct: 92.0,
      whenLabel: "yesterday",
    },
  ],
  organizationPreferences: DEFAULT_ORGANIZATION_PREFERENCES,
}

describe("buildOperationsCsv", () => {
  it("returns a stable header pair and a period-scoped filename", () => {
    const result = buildOperationsCsv(FIXTURE)
    expect(result.headers).toEqual(["Metric", "Value"])
    expect(result.filename).toBe("operations-overview_week")
  })

  it("emits the four headline summary metrics under the renamed period label", () => {
    const { rows } = buildOperationsCsv(FIXTURE)
    const flat = rows.map((r) => r.join("|"))
    expect(flat).toContain("Period label|Apr 21 – Apr 27")
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

  it("neutralizes CSV formula injection in user-controlled string cells", () => {
    const malicious: OperationsExportInput = {
      ...FIXTURE,
      periodLabel: "=cmd|' /C calc'!A1",
      utilization: {
        series: [{ label: "+SUM(A1:A2)", "@evil": 1 }],
        materials: ["@evil"],
      },
      recentCuts: [
        {
          id: "1",
          jobCode: "-2+3",
          operator: "\tDaniel",
          utilizationPct: 50,
          whenLabel: "\rnow",
        },
      ],
    }
    const { rows } = buildOperationsCsv(malicious)
    const flat = rows.map((r) => r.join("|"))
    // Each formula-prefix character ( = + - @ \t \r ) gets a leading
    // single-quote so spreadsheet apps render the cell as text.
    expect(flat).toContain("Period label|'=cmd|' /C calc'!A1")
    expect(rows.find((r) => r[0] === "'+SUM(A1:A2)")).toBeDefined()

    // Whitespace-prefixed formulas should also be neutralized — Excel/Sheets
    // trim leading whitespace before evaluating.
    const trickyInput: OperationsExportInput = {
      ...FIXTURE,
      periodLabel: "  =SUM(A1:A2)",
    }
    const trickyOut = buildOperationsCsv(trickyInput)
    const periodRow = trickyOut.rows.find((r) => r[0] === "Period label")
    expect(periodRow?.[1]).toBe("'  =SUM(A1:A2)")
    const utilHeader = rows.find(
      (r) => r[0] === "Bucket" && typeof r[1] === "string" && r[1].startsWith("'@")
    )
    expect(utilHeader).toBeDefined()
    const cutRow = rows.find((r) => r[0] === "'-2+3")
    expect(cutRow).toBeDefined()
    expect(cutRow?.[1]).toBe("'\tDaniel")
    expect(cutRow?.[3]).toBe("'\rnow")
  })
})

describe("buildOperationsPdf", () => {
  it("returns a non-empty PDF blob with the %PDF magic header", async () => {
    const blob = buildOperationsPdf(FIXTURE)
    expect(blob.type).toBe("application/pdf")
    expect(blob.size).toBeGreaterThan(1024)
    const head = await blob.slice(0, 5).text()
    expect(head).toBe("%PDF-")
  })

  it("renders without throwing on empty utilization and recent cuts", () => {
    const empty: OperationsExportInput = {
      ...FIXTURE,
      utilization: { series: [], materials: [] },
      recentCuts: [],
    }
    expect(() => buildOperationsPdf(empty)).not.toThrow()
  })

  it("renders without throwing for arbitrary user-controlled strings", () => {
    // jsPDF's text APIs accept raw strings — no HTML escape concern — but the
    // builder should still not crash on punctuation or unicode.
    const tricky: OperationsExportInput = {
      ...FIXTURE,
      periodLabel: 'Apr 21 – Apr 27 "weird" 〈chars〉',
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
    expect(() => buildOperationsPdf(tricky)).not.toThrow()
  })
})
