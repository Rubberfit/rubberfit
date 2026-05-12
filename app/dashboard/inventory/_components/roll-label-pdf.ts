// Import the browser subpath explicitly — bwip-js's `.` export
// picks the node build by default under bundler module resolution,
// which drags in fs/path type signatures that don't belong here.
import bwipjs from "bwip-js/browser"
import { jsPDF } from "jspdf"

import {
  BRAND_BLUE,
  drawLabelTopRule,
  GHOST,
  INK,
  LABEL_TOP_RULE,
  SLATE,
  STATUS_CHIPS,
  TYPE,
} from "@/app/lib/pdf"
import type { Roll } from "@/src/infrastructure/models/supabase"

/**
 * Scannable stock-label PDF for one or more rolls. Each label is
 * 4" × 2" and carries TWO scan surfaces plus human-readable text:
 *
 *   • **QR code** — encodes `{origin}/r/<part_number>/pdf`.
 *     Scanning with any phone camera opens a one-page PDF with the
 *     roll's key details. No app login, no landing page click.
 *   • **Code 128 barcode** — encodes just the part number. Lives
 *     for handheld laser scanners that can't read 2-D codes.
 *   • Mono part number, material, dimensions, location,
 *     and a REUSABLE OFFCUT chip when applicable.
 *
 * Single roll → one centered label on US Letter. Multiple rolls
 * → 2-column grid, up to N labels per page, clean pagination.
 *
 * Phase 7 — colors, fonts, and the 2pt brand-blue top rule come from
 * the shared design tokens at `@/app/lib/pdf`. The 4"×2" label aspect
 * is preserved (operator muscle memory + thermal-printer constraints)
 * so the existing horizontal QR+text split stays — Kimi's per-PDF
 * spec is met via the token application, not a layout rethink.
 */

const PAGE_W_PT = 612 // US Letter
const PAGE_H_PT = 792
const PAGE_MARGIN = 36
const LABEL_W_PT = 288 // 4 inch
const LABEL_H_PT = 144 // 2 inch
const LABEL_GAP_X = 18
const LABEL_GAP_Y = 18
const QR_SIZE_PT = 108 // fills the vertical label height with padding

/**
 * Resolves the origin for the QR-encoded URL. Priority:
 *   1. `NEXT_PUBLIC_APP_URL` — explicit host set in env. Use this
 *      to pin labels at the production URL even when printed
 *      from a dev box. e.g. `NEXT_PUBLIC_APP_URL=https://app.rubberfit.com`
 *   2. `NEXT_PUBLIC_VERCEL_URL` — auto-set on Vercel deployments.
 *   3. `window.location.origin` — whatever host the browser is on.
 *      On localhost this will encode a dev URL that only scans on
 *      the same machine, which is fine for local testing and is
 *      honest about what's actually going out.
 *
 * There is deliberately NO hardcoded remote fallback — an earlier
 * version defaulted to a guessed marketing domain that turned out
 * to be parked on GoDaddy. Better to encode the literal local
 * host than a wrong remote one.
 */
function resolveOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, "")
  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin
  }
  return "http://localhost:3000"
}

function buildScanUrl(roll: Roll, origin: string): string {
  // The QR code points straight at the PDF route so a phone scan
  // opens the document immediately instead of landing on the app.
  const id = roll.part_number ?? roll.id
  return `${origin}/r/${encodeURIComponent(id)}/pdf`
}

function renderBarcodePng(text: string, bcid: "code128" | "qrcode"): string {
  const canvas = document.createElement("canvas")
  // QR and linear codes want different option shapes. Linear bars
  // need an explicit `height` in modules; QR is a square matrix
  // driven purely by `scale`. Mixing `height: undefined` into the
  // QR path was the cause of the empty placeholder box we were
  // seeing on the printed labels.
  if (bcid === "qrcode") {
    bwipjs.toCanvas(canvas, {
      bcid: "qrcode",
      text,
      scale: 4,
      backgroundcolor: "FFFFFF",
    })
  } else {
    bwipjs.toCanvas(canvas, {
      bcid: "code128",
      text,
      scale: 3,
      height: 10,
      includetext: false,
      backgroundcolor: "FFFFFF",
    })
  }
  return canvas.toDataURL("image/png")
}

function drawLabel(doc: jsPDF, roll: Roll, x: number, y: number, origin: string) {
  // Brand-blue top rule (Kimi spec #5 — the only brand mark on the
  // label). Pulled from the shared `drawLabelTopRule` helper so every
  // label in the catalog produces the same 2pt stripe.
  drawLabelTopRule(doc, x, y, LABEL_W_PT)

  // Hairline frame in ghost — keeps the label boundary visible on
  // print without competing with the brand rule.
  doc.setDrawColor(GHOST[0], GHOST[1], GHOST[2])
  doc.setLineWidth(0.5)
  doc.rect(x, y + LABEL_TOP_RULE, LABEL_W_PT, LABEL_H_PT - LABEL_TOP_RULE)

  // Left block — QR code (phone scan → info PDF).
  const qrX = x + 14
  const qrY = y + LABEL_TOP_RULE + (LABEL_H_PT - LABEL_TOP_RULE - QR_SIZE_PT) / 2
  try {
    const qrPng = renderBarcodePng(buildScanUrl(roll, origin), "qrcode")
    doc.addImage(qrPng, "PNG", qrX, qrY, QR_SIZE_PT, QR_SIZE_PT)
  } catch (_error) {
    // Bwip rendering failed — print a placeholder rectangle so the
    // label still composes. Operators can rerun the print job.
    doc.setDrawColor(GHOST[0], GHOST[1], GHOST[2])
    doc.rect(qrX, qrY, QR_SIZE_PT, QR_SIZE_PT)
  }

  // Right block — text metadata + Code 128 band.
  const textX = qrX + QR_SIZE_PT + 12
  const textRight = x + LABEL_W_PT - 14
  const textWidth = textRight - textX
  const contentTop = y + LABEL_TOP_RULE + 14

  // Part number — primary human-readable ID. Kimi spec: Mono Bold,
  // 12pt floor (we use 14pt here so the operator can read it at arm's
  // length on a roll on the floor). Falls back to a short UUID slice
  // when the roll predates the part-number migration so the label
  // still prints an identifier instead of a blank dash. The QR + Code
  // 128 already encode the full id in that case so lookups keep working.
  //
  // Single constant for the font size AND baseline so the baseline
  // can't drift if we ever bump the size — the previous version hard-
  // coded 14 for setFontSize but used TYPE.mono.size (9) for the
  // baseline math, which would have shifted vertically if the size
  // changed (CodeRabbit catch).
  const PART_NUMBER_SIZE = 14
  const displayId = roll.part_number ?? `ID ${roll.id.slice(0, 8).toUpperCase()}`
  doc.setFont(TYPE.mono.family, "bold")
  doc.setFontSize(PART_NUMBER_SIZE)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(displayId, textX, contentTop + PART_NUMBER_SIZE + 2)

  // Material name — caption label + body value (slate / ink).
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text("MATERIAL", textX, contentTop + 28)
  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  doc.setTextColor(INK[0], INK[1], INK[2])
  doc.text(roll.material_type ?? "—", textX, contentTop + 40)

  // Dimensions.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text("DIMENSIONS", textX, contentTop + 56)
  doc.setFont(TYPE.body.family, TYPE.body.weight)
  doc.setFontSize(TYPE.body.size)
  doc.setTextColor(INK[0], INK[1], INK[2])
  const dims = `${roll.width}" × ${roll.length}" × ${roll.thickness}"`
  doc.text(dims, textX, contentTop + 68)

  // Code 128 band — bottom-right, for handheld laser scanners.
  try {
    const linearPng = renderBarcodePng(roll.part_number ?? roll.id, "code128")
    doc.addImage(linearPng, "PNG", textX, contentTop + 80, textWidth, 22)
  } catch (_error) {
    // Same fallback as the QR path — placeholder rectangle keeps the
    // label well-formed even if barcode generation fails.
    doc.setDrawColor(GHOST[0], GHOST[1], GHOST[2])
    doc.rect(textX, contentTop + 80, textWidth, 22)
  }

  // Footer row inside label — location + offcut chip.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  if (roll.location) {
    doc.text(roll.location, textX, y + LABEL_H_PT - 10)
  }
  if (roll.is_offcut) {
    const chip = STATUS_CHIPS.warning
    doc.setFont(TYPE.caption.family, "bold")
    doc.setFontSize(TYPE.caption.size)
    doc.setTextColor(chip.text[0], chip.text[1], chip.text[2])
    doc.text("REUSABLE OFFCUT", textRight, y + LABEL_H_PT - 10, {
      align: "right",
    })
    doc.setTextColor(INK[0], INK[1], INK[2])
  }
}

function addHeader(doc: jsPDF, pageIndex: number) {
  if (pageIndex > 0) doc.addPage()
  // Multi-label print runs get a single page-header line above the
  // grid (operator orientation only — labels themselves wear no
  // chrome per Kimi spec). Tokenized so it reads as part of the
  // family even on its own page.
  doc.setFont(TYPE.caption.family, TYPE.caption.weight)
  doc.setFontSize(TYPE.caption.size)
  doc.setTextColor(BRAND_BLUE[0], BRAND_BLUE[1], BRAND_BLUE[2])
  doc.text("RUBBERFIT · ROLL LABELS", PAGE_MARGIN, PAGE_MARGIN - 6)
  doc.setFont(TYPE.mono.family, TYPE.mono.weight)
  doc.setFontSize(TYPE.mono.size)
  doc.setTextColor(SLATE[0], SLATE[1], SLATE[2])
  doc.text(new Date().toLocaleString(), PAGE_W_PT - PAGE_MARGIN, PAGE_MARGIN - 6, {
    align: "right",
  })
}

export interface BuildRollLabelPdfOptions {
  fileName?: string
  /** Only used when multiple rolls — single-roll PDFs auto-center. */
  columns?: number
  /** Override origin (e.g. for SSR previews). Defaults to window.location.origin. */
  origin?: string
}

export function buildRollLabelPdf(rolls: Roll[], opts: BuildRollLabelPdfOptions = {}): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  doc.setProperties({ title: "Rubberfit roll labels" })
  const origin = opts.origin ?? resolveOrigin()

  if (rolls.length === 0) return doc

  // Single-roll shortcut — big centered label on page 1.
  if (rolls.length === 1) {
    addHeader(doc, 0)
    const x = (PAGE_W_PT - LABEL_W_PT) / 2
    const y = (PAGE_H_PT - LABEL_H_PT) / 2 - 40
    drawLabel(doc, rolls[0], x, y, origin)
    return doc
  }

  const cols = Math.max(1, Math.min(3, opts.columns ?? 2))
  const rowHeight = LABEL_H_PT + LABEL_GAP_Y
  const gridWidth = cols * LABEL_W_PT + (cols - 1) * LABEL_GAP_X
  const gridStartX = (PAGE_W_PT - gridWidth) / 2
  const gridStartY = PAGE_MARGIN + 12
  const rowsPerPage = Math.floor((PAGE_H_PT - gridStartY - PAGE_MARGIN) / rowHeight)
  const perPage = cols * rowsPerPage

  let pageIndex = 0
  rolls.forEach((roll, i) => {
    if (i % perPage === 0) {
      addHeader(doc, pageIndex)
      pageIndex += 1
    }
    const slot = i % perPage
    const row = Math.floor(slot / cols)
    const col = slot % cols
    const x = gridStartX + col * (LABEL_W_PT + LABEL_GAP_X)
    const y = gridStartY + row * rowHeight
    drawLabel(doc, roll, x, y, origin)
  })

  return doc
}

export function downloadRollLabelPdf(rolls: Roll[], opts: BuildRollLabelPdfOptions = {}): void {
  const doc = buildRollLabelPdf(rolls, opts)
  const first = rolls[0]
  const single = rolls.length === 1 && first
  const name =
    opts.fileName ??
    (single
      ? `${first.part_number ?? first.id}_label.pdf`
      : `rubberfit_labels_${new Date().toISOString().slice(0, 10)}.pdf`)
  doc.save(name)
}
