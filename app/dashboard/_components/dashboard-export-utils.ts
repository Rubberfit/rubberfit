import { format } from "date-fns"

import type { ExportData } from "@/src/application/services/export.service.interface"

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
}

const FILENAME_PREFIX = "operations-overview"

function formatCurrencyUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Neutralize CSV formula injection: cells whose first byte is one of
 * `= + - @ \t \r` are evaluated as formulas by Excel/Google Sheets when
 * the file is opened. Prefixing a single quote keeps the original text
 * visible to the user while preventing execution.
 */
function sanitizeCsvCell(value: string): string {
  if (value === "") return value
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
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

export function buildOperationsPdfHtml(input: OperationsExportInput): {
  title: string
  content: string
} {
  const generatedAt = format(new Date(), "MMM d, yyyy")

  const utilizationTable =
    input.utilization.series.length === 0
      ? "<p>No utilization data in window.</p>"
      : `
        <table>
          <thead>
            <tr>
              <th>Bucket</th>
              ${input.utilization.materials.map((material) => `<th>${escapeHtml(material)}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${input.utilization.series
              .map(
                (row) => `
              <tr>
                <td>${escapeHtml(String(row.label ?? ""))}</td>
                ${input.utilization.materials
                  .map((material) => {
                    const cell = row[material]
                    return `<td>${typeof cell === "number" ? cell.toFixed(1) : "0"}</td>`
                  })
                  .join("")}
              </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      `

  const recentCutsTable =
    input.recentCuts.length === 0
      ? "<p>No recent cuts.</p>"
      : `
        <table>
          <thead>
            <tr>
              <th>Job code</th>
              <th>Operator</th>
              <th>Utilization %</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            ${input.recentCuts
              .map(
                (cut) => `
              <tr>
                <td>${escapeHtml(cut.jobCode)}</td>
                <td>${escapeHtml(cut.operator)}</td>
                <td>${cut.utilizationPct.toFixed(1)}</td>
                <td>${escapeHtml(cut.whenLabel)}</td>
              </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      `

  const content = `
    <h1>Operations overview</h1>
    <p>${escapeHtml(input.periodLabel)} · period: ${escapeHtml(input.period)} · generated ${generatedAt}</p>

    <h2>Summary</h2>
    <div>
      <div class="metric-card">
        <div class="metric-value">${input.totalActiveRolls}</div>
        <div class="metric-label">Active rolls</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.cutsThisWeek}</div>
        <div class="metric-label">Cuts this week</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${input.wastePercentage.toFixed(1)}%</div>
        <div class="metric-label">Avg waste</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">${formatCurrencyUsd(input.inventoryValue)}</div>
        <div class="metric-label">Inventory value</div>
      </div>
    </div>

    <h2>Utilization (${input.utilPeriod})</h2>
    ${utilizationTable}

    <h2>Recent cuts</h2>
    ${recentCutsTable}
  `

  return { title: "Operations overview", content }
}
