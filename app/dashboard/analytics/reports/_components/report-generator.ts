import { format, subDays, subWeeks, subMonths } from "date-fns"
import { toast } from "sonner"

import { fetchCutsInRange } from "@/app/actions/cuts"
import { rollService } from "@/src/infrastructure/services/rollService"
import type { CutHistory, Roll } from "@/src/infrastructure/models/supabase"
import type { ReportTemplate } from "./report-templates"
import type { UnitDisplayPreferencesInput } from "@/src/application/preferences/user-unit-display"
import type { UserDatePreferencesInput } from "@/src/application/preferences/user-date-format"
import {
  buildAnalyticsReportPdf,
  type AnalyticsMaterialRow,
} from "./analytics-report-pdf"

/**
 * A CutHistory row decorated with its roll join. Replaces the
 * legacyCutService `CutWithRoll` re-export — the roll lookup is now
 * an in-memory join over the already-loaded `getAllRolls()` result,
 * because `fetchCutsInRange` returns raw CutHistory rows without a
 * server-side join.
 */
type CutWithRoll = CutHistory & {
  roll?: { material_type: string; location?: string | null } | null
}

function wastePercent(cut: CutHistory): number {
  const total = cut.scrap_sqft + cut.material_used_sqft
  return total > 0 ? (cut.scrap_sqft / total) * 100 : 0
}

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
    const material = (roll.material_type as string) ?? "Unknown"
    const sqft = ((roll.remaining_length as number) * (roll.width as number)) / 144
    const value =
      ((roll.remaining_length as number) *
        (roll.width as number) *
        ((roll.cost_per_sqft as number) || 0)) /
      144
    const existing = byMaterial.get(material)
    if (existing) {
      existing.activeRolls += 1
      existing.totalSqft += sqft
      existing.totalValue += value
    } else {
      byMaterial.set(material, { activeRolls: 1, totalSqft: sqft, totalValue: value })
    }
  }

  return [...byMaterial.entries()].map(([material, data]) => ({
    material,
    activeRolls: data.activeRolls,
    totalSqft: data.totalSqft,
    totalValue: data.totalValue,
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
  reportPeriod: "daily" | "weekly" | "monthly" | "quarterly",
  organizationPreferences?: UnitDisplayPreferencesInput & UserDatePreferencesInput
): Promise<void> {
  const report = reportTemplates.find((r) => r.id === reportId)
  if (!report) throw new Error("Report template not found")

  // Keep the artificial delay so the menu's in-flight guard is exercised.
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const { startDate, endDate } = getDateRange(reportPeriod)
  const periodLabel = reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)

  // The caller (reports/page.tsx) already wraps this in try/catch and
  // shows a toast on failure — rethrowing is enough, we just need to
  // preserve the single-layer error UI contract. `materialTypes` is not
  // consumed by the PDF builder; skip the fetch so a material-type
  // service outage doesn't fail the whole export.
  const [rawCuts, rolls] = await Promise.all([
    fetchCutsInRange(startDate, endDate),
    rollService.getAllRolls(),
  ])

  // In-memory roll join — `fetchCutsInRange` returns raw CutHistory
  // rows; the report renders the cut's material name via `roll.material_type`.
  const rollById = new Map<string, Roll>()
  for (const r of rolls ?? []) rollById.set(r.id, r)
  const cuts: CutWithRoll[] = rawCuts.map((c) => {
    const r = c.roll_id ? rollById.get(c.roll_id) : undefined
    return {
      ...c,
      roll: r ? { material_type: r.material_type, location: r.location } : null,
    }
  })

  const materialBreakdown = buildMaterialBreakdown(
    rolls as unknown as Array<Record<string, unknown>> | null
  )

  const summary = {
    totalCuts: cuts.length,
    totalMaterialUsed: cuts.reduce((sum, cut) => sum + cut.material_used_sqft, 0),
    averageWaste:
      cuts.length > 0 ? cuts.reduce((sum, cut) => sum + wastePercent(cut), 0) / cuts.length : 0,
    totalInventoryValue: (rolls || []).reduce(
      (sum, roll) => sum + (roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144,
      0
    ),
  }

  const doc = buildAnalyticsReportPdf({
    reportName: report.name,
    periodLabel,
    startDate,
    endDate,
    summary,
    materialBreakdown,
    // Cap at 20 rows so the recent-cuts table stays readable; future
    // templates can pass full slices if they need more.
    recentCuts: cuts.slice(0, 20),
    organizationPreferences,
  })

  const ts = format(new Date(), "yyyy-MM-dd_HHmm")
  const slug = report.name.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()
  doc.save(`${slug}_${reportPeriod}_${ts}.pdf`)

  toast.success(`${periodLabel} ${report.name} generated successfully`)
}
