import { format, subDays, subWeeks, subMonths } from "date-fns"
import { toast } from "sonner"

import { cutService } from "@/src/infrastructure/services/cutService"
import type { CutWithRoll } from "@/src/application/services/cut.service.interface"
import { rollService } from "@/src/infrastructure/services/rollService"
import { type AnalyticsMaterialRow, buildAnalyticsReportPdf } from "./analytics-report-pdf"
import type { ReportTemplate } from "./report-templates"

function getDateRange(reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"): {
  startDate: Date
  endDate: Date
} {
  const endDate = new Date()
  let startDate: Date

  switch (reportPeriod) {
    case "daily":
      startDate = subDays(endDate, 1)
      break
    case "weekly":
      startDate = subWeeks(endDate, 1)
      break
    case "monthly":
      startDate = subMonths(endDate, 1)
      break
    case "quarterly":
      startDate = subMonths(endDate, 3)
      break
    default:
      startDate = subMonths(endDate, 1)
  }

  return { startDate, endDate }
}

function buildMaterialBreakdown(
  rolls: Array<Record<string, unknown>> | null
): AnalyticsMaterialRow[] {
  const byMaterial = new Map<
    string,
    { activeRolls: number; totalSqft: number; totalValue: number }
  >()

  for (const roll of rolls ?? []) {
    if (roll.status !== "active") continue
    const materialType = (roll.material_type as string) ?? "Unknown"
    const sqft = ((roll.remaining_length as number) * (roll.width as number)) / 144
    const value =
      ((roll.remaining_length as number) *
        (roll.width as number) *
        ((roll.cost_per_sqft as number) || 0)) /
      144
    const existing = byMaterial.get(materialType)
    if (existing) {
      existing.activeRolls += 1
      existing.totalSqft += sqft
      existing.totalValue += value
    } else {
      byMaterial.set(materialType, { activeRolls: 1, totalSqft: sqft, totalValue: value })
    }
  }

  return Array.from(byMaterial.entries()).map(([material, agg]) => ({
    material,
    activeRolls: agg.activeRolls,
    totalSqft: agg.totalSqft,
    totalValue: agg.totalValue,
  }))
}

/**
 * Phase 7 PR 5 — generates the Analytics report PDF using the new
 * imperative jsPDF builder (`buildAnalyticsReportPdf`). The legacy
 * HTML stamper path (`exportPdfService.generatePDFReport(html)`)
 * is gone. All 4 templates (waste / costs / trends / usage) compose
 * into the same layout per founder Q4.
 */
export async function generateReport(
  reportId: string,
  reportTemplates: ReportTemplate[],
  reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"
): Promise<void> {
  const report = reportTemplates.find((r) => r.id === reportId)
  if (!report) throw new Error("Report template not found")

  // Keep the artificial delay so the menu's in-flight guard is exercised.
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const { startDate, endDate } = getDateRange(reportPeriod)
  const periodLabel = reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)

  const [cuts, rolls] = await Promise.all([
    cutService.getCutsByDateRangeWithRolls(startDate, endDate),
    rollService.getAllRolls(),
  ])

  const cutList: CutWithRoll[] = cuts ?? []
  // `Roll[]` doesn't structurally satisfy `Record<string, unknown>[]`
  // (it has typed columns, not an index signature), so go through
  // `unknown` for the dynamic-access path below. This stays at the
  // service boundary; the downstream code treats fields as untyped.
  const rollList = (rolls ?? []) as unknown as Array<Record<string, unknown>>

  const summary = {
    totalCuts: cutList.length,
    totalMaterialUsed: cutList.reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0),
    averageWaste:
      cutList.length > 0
        ? cutList.reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) / cutList.length
        : 0,
    totalInventoryValue: rollList.reduce(
      (sum, roll) =>
        sum +
        (((roll.remaining_length as number) ?? 0) *
          ((roll.width as number) ?? 0) *
          (((roll.cost_per_sqft as number) ?? 0) || 0)) /
          144,
      0
    ),
  }

  const materialBreakdown = buildMaterialBreakdown(rollList)

  const doc = buildAnalyticsReportPdf({
    reportName: report.name,
    periodLabel,
    startDate,
    endDate,
    summary,
    materialBreakdown,
    // Cap at 20 rows so the recent-cuts table stays readable; future
    // templates can pass full slices if they need more.
    recentCuts: cutList.slice(0, 20),
  })

  const ts = format(new Date(), "yyyy-MM-dd_HHmm")
  const slug = report.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
  doc.save(`${slug}_${reportPeriod}_${ts}.pdf`)

  toast.success(`${periodLabel} ${report.name} generated successfully`)
}
