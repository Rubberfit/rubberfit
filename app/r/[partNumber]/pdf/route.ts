import { jsPDF } from "jspdf"

import { SIGNAL, RULE, INK, SLATE, TYPE, WHITE } from "@/app/lib/pdf"
import { makeAdminClient } from "@/app/api/_lib/supabase-server"
import {
  getPublicRollByPartNumberOrId,
  type PublicRoll,
} from "@/src/infrastructure/services/rollService"
import {
  getOrgPreferencesForRoll,
  type OrgPrintPreferencesInput,
} from "@/src/infrastructure/services/cut-pdf-prefs-lookup"
import {
  formatAreaSqft,
  formatLengthInches,
  formatDimensionsInches,
} from "@/src/application/preferences/user-unit-display"
import { formatUserDate, formatUserDateTime } from "@/src/application/preferences/user-date-format"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ partNumber: string }>
}

async function loadRoll(partNumber: string): Promise<PublicRoll | null> {
  const client = makeAdminClient()
  if (!client) return null
  return getPublicRollByPartNumberOrId(client, partNumber)
}

/**
 * Resolve the roll's organization print preferences (best-effort).
 * Returns undefined on any error so the PDF still renders with
 * imperial / `MM/dd/yyyy` / `America/Chicago` defaults — the public
 * scan endpoint must never 500 on a missing prefs row.
 */
async function loadPrintPrefs(rollId: string): Promise<OrgPrintPreferencesInput | undefined> {
  const client = makeAdminClient()
  if (!client) return undefined
  return getOrgPreferencesForRoll(client, rollId)
}

/**
 * Roll-layout diagram — aspect-ratio-correct rectangle filling the
 * right half of the scan PDF so a floor operator can gauge remaining
 * stock at a glance without reading the numeric rows.
 *
 * Zones (top-to-bottom):
 *   • Remaining — amber-100 (`#fef3c7`), height = remaining × scale
 *   • Used      — stone-300 (`#d6d3d1`), height = (length − remaining) × scale
 *
 * Offcut rolls render as a full amber rectangle regardless of
 * `remaining_length` — they don't have a "used" half, and an operator
 * expects the diagram to match the TYPE row ("Reusable offcut").
 *
 * `boxW` / `boxH` is the TOTAL budget (diagram + label gutters);
 * the roll rect itself is smaller so the width label sits above the
 * top edge and the length label sits to the right of the right edge
 * without bleeding past the box.
 */
function drawRollDiagram(
  doc: jsPDF,
  roll: PublicRoll,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  prefs: OrgPrintPreferencesInput | undefined
): void {
  const TOP_GUTTER = 18
  const RIGHT_GUTTER = 32
  const rectMaxW = Math.max(1, boxW - RIGHT_GUTTER)
  const rectMaxH = Math.max(1, boxH - TOP_GUTTER)

  const widthIn = Math.max(0.0001, roll.width)
  const lengthIn = Math.max(0.0001, roll.length)
  const scale = Math.min(rectMaxW / widthIn, rectMaxH / lengthIn)
  const drawW = widthIn * scale
  const drawH = lengthIn * scale
  const ox = boxX + (rectMaxW - drawW) / 2
  const oy = boxY + TOP_GUTTER + (rectMaxH - drawH) / 2

  // Clamp so data drift can't produce negative or overflowing zones.
  const safeRemaining = Math.max(0, Math.min(roll.remaining_length, lengthIn))
  const isOffcut = roll.is_offcut === true
  const remainingH = isOffcut ? drawH : safeRemaining * scale
  const usedH = isOffcut ? 0 : (lengthIn - safeRemaining) * scale

  // Base (stone-100) — mostly covered by zones, but visible as a
  // subtle edge when remaining or used happens to round to 0.
  doc.setFillColor(245, 245, 244)
  doc.rect(ox, oy, drawW, drawH, "F")

  if (remainingH > 0) {
    doc.setFillColor(254, 243, 199) // amber-100
    doc.rect(ox, oy, drawW, remainingH, "F")
  }
  if (usedH > 0) {
    doc.setFillColor(214, 211, 209) // stone-300
    doc.rect(ox, oy + remainingH, drawW, usedH, "F")
  }

  // Outline drawn last so corners remain crisp over the fills.
  doc.setDrawColor(168, 162, 158) // stone-400
  doc.setLineWidth(1)
  doc.rect(ox, oy, drawW, drawH, "S")

  // Dimension labels — width along the top, length along the right.
  // PR 2e: use formatLengthInches so a metric org gets cm labels here
  // too, matching the row table below.
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(75, 85, 99) // gray-600
  doc.text(formatLengthInches(widthIn, prefs), ox + drawW / 2, oy - 6, { align: "center" })
  doc.text(formatLengthInches(lengthIn, prefs), ox + drawW + 6, oy + drawH / 2 + 3)

  // Remaining % inside the amber zone when it's tall enough to read.
  if (remainingH >= 14) {
    const pct = Math.round((safeRemaining / lengthIn) * 100)
    const remainingLabel = formatLengthInches(safeRemaining, prefs)
    const label = isOffcut ? `${remainingLabel} available` : `${remainingLabel} (${pct}%)`
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(120, 53, 15) // amber-900
    doc.text(label, ox + drawW / 2, oy + remainingH / 2 + 4, { align: "center" })
  }

  if (isOffcut) {
    const badgeW = 58
    const badgeH = 14
    const badgeX = ox + drawW - badgeW - 4
    const badgeY = oy + 4
    doc.setFillColor(245, 158, 11) // amber-500
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text("OFFCUT", badgeX + badgeW / 2, badgeY + 9.5, { align: "center" })
  }
}

function buildScanPdf(roll: PublicRoll, prefs: OrgPrintPreferencesInput | undefined): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 72
  doc.setProperties({ title: `Rubberfit · ${roll.part_number ?? roll.id}` })

  // Brand-blue header bar — single mark on the page. Phase 7 tokens.
  doc.setFillColor(SIGNAL[0], SIGNAL[1], SIGNAL[2])
  doc.rect(0, 0, pageWidth, 48, "F")
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2])
  doc.setFont(TYPE.h1.family, TYPE.h1.weight)
  doc.setFontSize(TYPE.h1.size)
  doc.text("Rubberfit", 40, 32)
  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  doc.text("Roll Info", pageWidth - 40, 32, { align: "right" })

  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.setFont(TYPE.mono.family, "bold")
  doc.setFontSize(28)
  doc.text(roll.part_number ?? `ID ${roll.id.slice(0, 8).toUpperCase()}`, 40, (y += 16))
  doc.setFont(TYPE.h2.family, TYPE.h2.weight)
  doc.setFontSize(16)
  doc.text(roll.material_type, 40, (y += 22))

  if (roll.color) {
    doc.setFont(TYPE.body.family, TYPE.body.weight)
    doc.setFontSize(11)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text(roll.color, 40, (y += 16))
    doc.setTextColor(INK[0], INK[1], INK[2])
  }

  y += 18
  doc.setDrawColor(RULE[0], RULE[1], RULE[2])
  doc.line(40, y, pageWidth - 40, y)
  y += 20

  // PR 2e: dimensions, remaining length, and available area all flow
  // through the unit helpers so a metric-org operator sees `cm` / `m²`
  // on a scanned label instead of hardcoded imperial. Date row uses
  // formatUserDate to honor the operator's `dateFormat`.
  const remainingLengthLabel = formatLengthInches(roll.remaining_length, prefs)
  const lengthGuard = Math.max(roll.length, 0.0001)
  const availableSqft = (roll.remaining_length * roll.width) / 144
  const rows: Array<[string, string]> = [
    ["Part number", roll.part_number ?? roll.id],
    ["Dimensions", formatDimensionsInches([roll.width, roll.length, roll.thickness], prefs)],
    [
      "Remaining length",
      `${remainingLengthLabel}  (${((roll.remaining_length / lengthGuard) * 100).toFixed(0)}%)`,
    ],
    ["Available area", formatAreaSqft(availableSqft, prefs)],
    ["Status", roll.status],
    ["Location", roll.location ?? "—"],
    ["Date received", formatUserDate(roll.date_received, prefs) || "—"],
    ["Type", roll.is_offcut ? "Reusable offcut" : "Primary roll"],
  ]

  // Info rows start here — capture the starting Y so the diagram
  // can align its top with the first row.
  const rowsStartY = y

  doc.setFontSize(TYPE.body.size)
  for (const [label, value] of rows) {
    doc.setFont(TYPE.caption.family, TYPE.caption.weight)
    doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
    doc.text(label.toUpperCase(), 40, y)
    doc.setFont(TYPE.body.family, TYPE.body.weight)
    doc.setTextColor(INK[0], INK[1], INK[2])
    doc.text(value, 180, y)
    y += 20
  }

  // Glance-view roll diagram in the right half of the page, aligned
  // with the top of the info rows.
  drawRollDiagram(doc, roll, 320, rowsStartY - 10, pageWidth - 320 - 40, 260, prefs)

  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text(
    `Generated ${formatUserDateTime(new Date(), prefs) || "—"}`,
    40,
    doc.internal.pageSize.getHeight() - 30
  )
  doc.text("rubberfit.com", pageWidth - 40, doc.internal.pageSize.getHeight() - 30, {
    align: "right",
  })

  return doc
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { partNumber } = await context.params
  const roll = await loadRoll(partNumber)

  if (!roll) {
    return new Response("Not Found", { status: 404 })
  }

  const prefs = await loadPrintPrefs(roll.id)
  const pdfBytes = buildScanPdf(roll, prefs).output("arraybuffer")
  const fileName = `${(roll.part_number ?? roll.id).replace(/[^A-Za-z0-9._-]/g, "_")}_info.pdf`

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${fileName}"`,
      "content-type": "application/pdf",
    },
  })
}
