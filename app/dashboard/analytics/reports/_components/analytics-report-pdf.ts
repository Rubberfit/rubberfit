import { format } from "date-fns"
import { jsPDF } from "jspdf"

import {
  contentStartY,
  CUSTOMER_PAGE,
  drawCustomerChrome,
  drawKpiCard,
  drawRuledTable,
  drawSectionDivider,
  drawStatusChip,
  KPI_GAP,
  KPI_MIN_HEIGHT,
  resetColors,
  SLATE,
  stampFooterOnEveryPage,
  type TableColumn,
  TYPE,
} from "@/app/lib/pdf"
import type { CutWithRoll } from "@/src/application/services/cut.service.interface"
import {
  formatDimensionsInches,
  getAreaUnitLabel,
  getDisplayAreaValue,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"

/**
 * Analytics Report PDF — Phase 7 PR 5.
 *
 * Replaces the HTML stamper (`report-generator.ts` previously called
 * `exportPdfService.generatePDFReport(html)`). Customer canvas
 * (Letter 612×792pt @ 48pt margin) with a single shared layout that
 * all 4 Analytics templates (waste / costs / trends / usage) compose
 * into — per founder Q4 there's one layout, just different KPI labels
 * per template.
 */

const PAGE_MARGIN = CUSTOMER_PAGE.margin
const CONTENT_W = CUSTOMER_PAGE.contentWidth

export interface AnalyticsReportSummary {
  readonly totalCuts: number
  readonly totalMaterialUsed: number
  readonly averageWaste: number
  readonly totalInventoryValue: number
}

export interface AnalyticsMaterialRow {
  readonly material: string
  readonly activeRolls: number
  readonly totalSqft: number
  readonly totalValue: number
}

export interface AnalyticsReportInput {
  /** Template name — used as the H1 title. */
  readonly reportName: string
  /** Period label shown in the period chip + header meta line. */
  readonly periodLabel: string
  readonly startDate: Date
  readonly endDate: Date
  readonly summary: AnalyticsReportSummary
  readonly materialBreakdown: ReadonlyArray<AnalyticsMaterialRow>
  /** Recent cuts — caller slices to whatever count they want surfaced. */
  readonly recentCuts: ReadonlyArray<CutWithRoll>
  /**
   * Org-level unit preferences. Drives the KPI / table / cut-dimension
   * unit labels + numeric conversion. Optional so legacy callers fall
   * back to imperial; the production call site populates it from
   * `useOrganizationPreferences()`.
   */
  readonly organizationPreferences?: UnitDisplayPreferencesInput
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function buildAnalyticsReportPdf(input: AnalyticsReportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: [CUSTOMER_PAGE.width, CUSTOMER_PAGE.height] })
  const title = input.reportName.toUpperCase()
  const unitPreferences = input.organizationPreferences
  const areaUnitLower = getAreaUnitLabel(unitPreferences)
  // Imperial 'sq ft' is a textual abbreviation — UPPERCASE for the KPI
  // strip per the existing chrome convention. Metric 'm²' is an SI
  // symbol whose casing is normative ('M²' is invalid); preserve as-is.
  const areaUnitForKpi =
    unitPreferences?.unitSystem === "metric" ? areaUnitLower : areaUnitLower.toUpperCase()

  doc.setProperties({
    title: input.reportName,
    subject: `Rubberfit Analytics Report — ${input.periodLabel}`,
    author: "Rubberfit",
    creator: "Rubberfit",
  })

  drawCustomerChrome(doc, { title })
  resetColors(doc)

  let y = contentStartY("customer")

  // Period meta + chip combo — chip sits IMMEDIATELY next to the
  // date range so they read as one phrase (founder catch — chip
  // floating in the middle of the page is disorienting). The 12pt
  // gap matches the baseline-grid rhythm.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  const dateRange = `${format(input.startDate, "MMM d, yyyy")} – ${format(input.endDate, "MMM d, yyyy")}`
  const dateUpper = dateRange.toUpperCase()
  doc.text(dateUpper, PAGE_MARGIN, y)
  const dateWidth = doc.getTextWidth(dateUpper)
  drawStatusChip(doc, {
    x: PAGE_MARGIN + dateWidth + 12,
    y: y - 10,
    label: input.periodLabel,
    intent: "info",
  })
  y += TYPE.caption.lineHeight + 16

  // 4-up KPI strip — same labels across every template, callers can rename.
  const cards: ReadonlyArray<{ label: string; value: string; unit?: string }> = [
    { label: "Total cuts", value: String(input.summary.totalCuts) },
    {
      label: "Material used",
      value: getDisplayAreaValue(input.summary.totalMaterialUsed, unitPreferences).toFixed(1),
      unit: areaUnitForKpi,
    },
    {
      label: "Avg waste",
      value: input.summary.averageWaste.toFixed(1),
      unit: "%",
    },
    { label: "Inventory value", value: formatMoney(input.summary.totalInventoryValue) },
  ]
  const cardW = (CONTENT_W - KPI_GAP * (cards.length - 1)) / cards.length
  for (let i = 0; i < cards.length; i += 1) {
    const card = cards[i]
    if (!card) continue
    drawKpiCard(doc, {
      x: PAGE_MARGIN + i * (cardW + KPI_GAP),
      y,
      width: cardW,
      label: card.label,
      value: card.value,
      unit: card.unit,
    })
  }
  y += KPI_MIN_HEIGHT + 24

  // Material breakdown.
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Material breakdown",
  })
  y += 12

  if (input.materialBreakdown.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No material breakdown data available.", PAGE_MARGIN, y + TYPE.body.size)
    y += TYPE.body.lineHeight + 16
  } else {
    const materialColumns: ReadonlyArray<TableColumn> = [
      { header: "Material type", width: 240 },
      { header: "Active rolls", width: 92, align: "right", mono: true },
      { header: `Total ${areaUnitLower}`, width: 92, align: "right", mono: true },
      { header: "Value", width: 92, align: "right", mono: true },
    ]
    const materialRows = input.materialBreakdown.map((m) => ({
      cells: [
        m.material,
        String(m.activeRolls),
        getDisplayAreaValue(m.totalSqft, unitPreferences).toFixed(1),
        formatMoney(m.totalValue),
      ],
    }))
    y =
      drawRuledTable(doc, {
        x: PAGE_MARGIN,
        y,
        columns: materialColumns,
        rows: materialRows,
        pageBreak: {
          canvas: "customer",
          redrawChrome: (page) => {
            drawCustomerChrome(page, { title })
            return contentStartY("customer")
          },
        },
      }) + 24
  }

  // Recent cuts.
  y = drawSectionDivider(doc, {
    x: PAGE_MARGIN,
    y,
    width: CONTENT_W,
    title: "Recent cuts",
  })
  y += 12

  if (input.recentCuts.length === 0) {
    doc.setFont(TYPE.body.family, "italic")
    doc.setFontSize(TYPE.body.size)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text("No cuts recorded for this period.", PAGE_MARGIN, y + TYPE.body.size)
  } else {
    const cutColumns: ReadonlyArray<TableColumn> = [
      { header: "Date", width: 90 },
      { header: "Material", width: 140 },
      { header: "Dimensions", width: 96 },
      { header: "Qty", width: 50, align: "right", mono: true },
      { header: "Waste", width: 60, align: "right", mono: true },
      { header: "Job ref", width: 80, mono: true },
    ]
    const cutRows = input.recentCuts.map((cut) => {
      // `Number(null) === 0` and `Number(undefined) === NaN`, so neither
      // `??` nor `||` cleanly handles every shape (`??` lets NaN
      // propagate; `||` does the right thing but trips the no-falsy-OR
      // lint on numerics). Explicit `Number.isFinite` guard satisfies
      // both the CR style nudge AND the NaN edge case.
      const wasteNum = Number(cut.waste_percentage)
      const waste = Number.isFinite(wasteNum) ? wasteNum : 0
      return {
        cells: [
          format(new Date(cut.created_at), "MM/dd/yyyy"),
          cut.roll?.material_type ?? "Unknown",
          formatDimensionsInches([cut.cut_width, cut.cut_length], unitPreferences),
          String(cut.quantity),
          `${waste.toFixed(1)}%`,
          cut.job_reference ?? "—",
        ],
      }
    })
    drawRuledTable(doc, {
      x: PAGE_MARGIN,
      y,
      columns: cutColumns,
      rows: cutRows,
      pageBreak: {
        canvas: "customer",
        redrawChrome: (page) => {
          drawCustomerChrome(page, { title })
          return contentStartY("customer")
        },
      },
    })
  }

  const ts = format(new Date(), "yyyy-MM-dd HH:mm")
  stampFooterOnEveryPage(doc, "customer", () => `${input.reportName} · ${ts}`)

  return doc
}
