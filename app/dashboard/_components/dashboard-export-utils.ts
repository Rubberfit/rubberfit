import type { ExportData } from "@/src/application/services/export.service.interface"
import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"

import type { RecentCutRow } from "./dashboard-recent-cuts-card"
import type { UtilizationDatum } from "./dashboard-utilization-card"

export type DashboardPeriod = "week" | "month" | "quarter"
export type DashboardUtilPeriod = "7d" | "30d" | "90d"

export interface OperationsExportInput {
  period: DashboardPeriod
  /**
   * Human-readable label describing the export window (e.g.
   * "Apr 21 – Apr 27", "April 2026", "Q2 2026"). Caller computes the
   * shape based on `period` so the artifact matches the dashboard view.
   */
  periodLabel: string
  utilPeriod: DashboardUtilPeriod
  totalActiveRolls: number
  cutsThisWeek: number
  wastePercentage: number
  inventoryValue: number
  utilization: { series: UtilizationDatum[]; materials: string[] }
  recentCuts: RecentCutRow[]
  /**
   * Workspace-level locale / dateFormat / timeZone — applied to
   * visible PDF text (footer timestamp, etc) per the 2026-05-14
   * operator-seeds-prints ruling. Per-viewer overrides drive only
   * the screen display, never the exported artifact. The caller is
   * also responsible for deriving `periodLabel` / `cutsThisWeek` /
   * `utilization` labels from these same prefs so the body and
   * footer agree. Filenames stay machine-stable (`yyyy-MM-dd_HHmm`)
   * regardless of this field.
   */
  organizationPreferences?: UserDatePreferencesInput
}

const FILENAME_PREFIX = "operations-overview"

function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Neutralize CSV formula injection. Excel/Google Sheets evaluate cells
 * starting with `=`, `+`, `-`, `@` as formulas, and treat leading `\t`
 * or `\r` as paste/cell-break sentinels. Excel also trims leading
 * whitespace before evaluating the formula chars, so `"  =SUM(A1:A2)"`
 * is just as dangerous as `"=SUM(A1:A2)"`. Prefix a single quote to
 * keep the original text visible while preventing execution.
 */
function sanitizeCsvCell(value: string): string {
  if (value === "") return value
  // Tab and carriage return are sentinels in their own right — `trimStart`
  // would strip them before the regex check, so handle them up front.
  if (/^[\t\r]/.test(value)) return `'${value}`
  const trimmed = value.trimStart()
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value
}

export function buildOperationsCsv(input: OperationsExportInput): ExportData {
  const summaryRows: ExportData["rows"] = [
    ["Period", input.period],
    ["Period label", sanitizeCsvCell(input.periodLabel)],
    ["Active rolls", input.totalActiveRolls],
    ["Cuts this week", input.cutsThisWeek],
    ["Avg waste %", input.wastePercentage.toFixed(1)],
    ["Inventory value", formatCurrencyUsd(input.inventoryValue)],
  ]

  const utilizationHeader: ExportData["rows"] = [
    [],
    [sanitizeCsvCell(`Utilization (${input.utilPeriod}) — sqft by material`)],
    ["Bucket", ...input.utilization.materials.map(sanitizeCsvCell)],
  ]
  const utilizationRows: ExportData["rows"] = input.utilization.series.map((row) => [
    sanitizeCsvCell(String(row.label ?? "")),
    ...input.utilization.materials.map((material) => {
      const cell = row[material]
      return typeof cell === "number" ? cell : 0
    }),
  ])

  const recentCutsHeader: ExportData["rows"] = [
    [],
    ["Recent cuts"],
    ["Job code", "Operator", "Utilization %", "When"],
  ]
  const recentCutsRows: ExportData["rows"] = input.recentCuts.map((cut) => [
    sanitizeCsvCell(cut.jobCode),
    sanitizeCsvCell(cut.operator),
    cut.utilizationPct,
    sanitizeCsvCell(cut.whenLabel),
  ])

  return {
    headers: ["Metric", "Value"],
    rows: [
      ...summaryRows,
      ...utilizationHeader,
      ...utilizationRows,
      ...recentCutsHeader,
      ...recentCutsRows,
    ],
    filename: `${FILENAME_PREFIX}_${input.period}`,
  }
}
