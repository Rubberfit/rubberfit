import { format, subDays, subWeeks, subMonths } from "date-fns"
import { toast } from "sonner"

import { cutService } from "@/src/infrastructure/services/cutService"
import type { CutWithRoll } from "@/src/application/services/cut.service.interface"
import { rollService } from "@/src/infrastructure/services/rollService"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { exportPdfService } from "@/src/infrastructure/services/exportPdfService"
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
): Record<string, { activeRolls: number; totalSqft: number; totalValue: number }> {
  const materialBreakdown: Record<
    string,
    { activeRolls: number; totalSqft: number; totalValue: number }
  > = {}

  ;(rolls || []).forEach((roll) => {
    if (roll.status === "active") {
      const materialType = roll.material_type as string
      if (!materialBreakdown[materialType]) {
        materialBreakdown[materialType] = {
          activeRolls: 0,
          totalSqft: 0,
          totalValue: 0,
        }
      }
      materialBreakdown[materialType].activeRolls += 1
      materialBreakdown[materialType].totalSqft +=
        ((roll.remaining_length as number) * (roll.width as number)) / 144
      materialBreakdown[materialType].totalValue +=
        ((roll.remaining_length as number) *
          (roll.width as number) *
          ((roll.cost_per_sqft as number) || 0)) /
        144
    }
  })

  return materialBreakdown
}

function buildHtmlContent(
  reportData: {
    summary: {
      totalCuts: number
      totalMaterialUsed: number
      averageWaste: number
      totalInventoryValue: number
    }
    materialBreakdown: Record<
      string,
      { activeRolls: number; totalSqft: number; totalValue: number }
    >
    data: { cuts: CutWithRoll[] }
  },
  periodLabel: string,
  startDate: Date,
  endDate: Date
): string {
  return `
    <p>Report Period: ${periodLabel}</p>
    <p>Date Range: ${format(startDate, "MMM dd, yyyy")} - ${format(endDate, "MMM dd, yyyy")}</p>

    <h2>Summary</h2>
    <ul>
      <li>Total Cuts: ${reportData.summary.totalCuts}</li>
      <li>Total Material Used: ${reportData.summary.totalMaterialUsed.toFixed(2)} sqft</li>
      <li>Average Waste: ${reportData.summary.averageWaste.toFixed(1)}%</li>
      <li>Total Inventory Value: $${reportData.summary.totalInventoryValue.toFixed(2)}</li>
    </ul>

    <h2>Material Breakdown</h2>
    ${
      Object.keys(reportData.materialBreakdown).length > 0
        ? `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material Type</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Active Rolls</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Total sqft</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Value</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(reportData.materialBreakdown)
          .map(
            ([material, data]: [
              string,
              { activeRolls: number; totalSqft: number; totalValue: number },
            ]) => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${material}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${data.activeRolls || 0}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(data.totalSqft || 0).toFixed(2)}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${(data.totalValue || 0).toFixed(2)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
    `
        : "<p>No material breakdown data available for this period.</p>"
    }

    <h2>Recent Cuts</h2>
    ${
      (reportData.data.cuts || []).length > 0
        ? `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Date</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Material</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Dimensions</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Qty</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Waste %</th>
          <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Job Ref</th>
        </tr>
      </thead>
      <tbody>
        ${reportData.data.cuts
          .slice(0, 20)
          .map(
            (cut: CutWithRoll) => `
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">${format(new Date(cut.created_at), "MM/dd/yyyy")}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${cut.roll?.material_type || "Unknown"}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${cut.cut_width}" × ${cut.cut_length}"</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${cut.quantity}</td>
            <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${(Number(cut.waste_percentage) || 0).toFixed(1)}%</td>
            <td style="border: 1px solid #ddd; padding: 8px;">${cut.job_reference || "-"}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
    `
        : "<p>No cuts recorded for this period.</p>"
    }
  `
}

export async function generateReport(
  reportId: string,
  reportTemplates: ReportTemplate[],
  reportPeriod: "daily" | "weekly" | "monthly" | "quarterly"
) {
  // Report template lookup fails synchronously before any network
  // work — no wrap needed; the caller decides how to surface it.
  const report = reportTemplates.find((r) => r.id === reportId)
  if (!report) throw new Error("Report template not found")

  // Simulate report generation delay
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const { startDate, endDate } = getDateRange(reportPeriod)
  const periodLabel = reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)

  // Wrap the service + export calls so a single failing upstream
  // (Supabase timeout, PDF generator crash) surfaces a concrete
  // error toast instead of an unhandled promise rejection. The
  // caller's UI also clears its "generating" state on throw.
  try {
    const [cuts, rolls, materialTypes] = await Promise.all([
      cutService.getCutsByDateRangeWithRolls(startDate, endDate),
      rollService.getAllRolls(),
      materialTypeService.getAll(),
    ])

    const materialBreakdown = buildMaterialBreakdown(
      rolls as unknown as Array<Record<string, unknown>> | null
    )

    const reportData = {
      reportName: report.name,
      period: reportPeriod,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
      data: {
        cuts: cuts || [],
        rolls: rolls || [],
        materialTypes: materialTypes || [],
      },
      summary: {
        totalCuts: (cuts || []).length,
        totalMaterialUsed: (cuts || []).reduce((sum, cut) => sum + (cut.total_sqft_used || 0), 0),
        averageWaste:
          (cuts || []).length > 0
            ? (cuts || []).reduce((sum, cut) => sum + (cut.waste_percentage || 0), 0) /
              (cuts || []).length
            : 0,
        totalInventoryValue: (rolls || []).reduce(
          (sum, roll) =>
            sum + (roll.remaining_length * roll.width * (roll.cost_per_sqft || 0)) / 144,
          0
        ),
      },
      materialBreakdown,
    }

    const htmlContent = buildHtmlContent(reportData, periodLabel, startDate, endDate)
    await exportPdfService.generatePDFReport(report.name, htmlContent)

    toast.success(`${periodLabel} ${report.name} generated successfully`)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    toast.error(`Failed to generate ${periodLabel} ${report.name}: ${message}`)
    throw error
  }
}
