import jsPDF from "jspdf"
import { format } from "date-fns"

import { ARC_ANCHOR_LOGO_BASE64 } from "./arc-anchor-logo"
import { uploadCutPdf } from "@/src/infrastructure/services/cutHistoryService"
import { authService } from "@/src/infrastructure/services/authService"
import type { SimpleCutMetrics } from "./nesting-visualizer-types"
import type { PartTemplate } from "./PresetDimensionSelector"
import type { StockConfig } from "./stock-preview-configurator"
import { PART_OPTIONS } from "./preset-template-data"
import type { LayoutModel, PlacedPart, LayoutRegion } from "./layout-model"
import { buildOffcutSummary, type OffcutSummaryRow } from "./cut-history-pdf-offcut"

// ── Types ────────────────────────────────────────────────────────────────────

export interface CutPdfData {
  cutId: string
  stockWidth: number
  stockLength: number
  stockThickness: number
  materialName: string
  profileTitle: string
  tagMap: Map<string, string>
  partsCompleted: number
  cutPieces: number
  rollCount: number
  materialUsedSqFt: number
  reusableOffcutSqFt: number
  reusableOffcutPct: number
  scrapSqFt: number
  scrapPct: number
  fabScore: number
  cutDate: string
}

// ── Constants ────────────────────────────────────────────────────────────────

type RGB = readonly [number, number, number]

const MARGIN = 15
const PAGE_W = 210
const PAGE_H = 297
const CONTENT_W = PAGE_W - MARGIN * 2

const BRAND: RGB = [37, 99, 235]
const GRAY_900: RGB = [17, 24, 39]
const GRAY_700: RGB = [55, 65, 81]
const GRAY_500: RGB = [107, 114, 128]
const GRAY_200: RGB = [229, 231, 235]
const GRAY_50: RGB = [249, 250, 251]
const WHITE: RGB = [255, 255, 255]

// Blueprint palette: a single semantic per-region scheme so the diagram reads
// as material zones (shape vs. reusable vs. waste), not a per-spec rainbow.
// Each region paints with a soft fill + a 45° hatch stroke for engineering-
// drawing affect.
const PART_FILL_RGB: RGB = [220, 252, 231] // emerald-100 — shape body
const PART_HATCH_RGB: RGB = [110, 217, 145] // emerald-400 — diagonal lines
const PART_STROKE_RGB: RGB = [22, 163, 74] // emerald-600 — outline
const OFFCUT_FILL_RGB: RGB = [254, 243, 199] // amber-100 — reusable zone
const OFFCUT_HATCH_RGB: RGB = [245, 158, 11] // amber-500 — diagonals
const OFFCUT_STROKE_RGB: RGB = [180, 83, 9] // amber-700 — outline
const SCRAP_FILL_RGB: RGB = [254, 226, 226] // red-100 — waste zone
const SCRAP_HATCH_RGB: RGB = [239, 68, 68] // red-500 — diagonals
const SCRAP_STROKE_RGB: RGB = [185, 28, 28] // red-700 — outline
const SHEET_STROKE_RGB: RGB = [55, 65, 81] // gray-700 — sheet border + dim arrows
const LABEL_TEXT_RGB: RGB = [17, 24, 39] // gray-900 — labels read against light fills

// Hatch geometry. Lines run at 45° in PDF (mm) space so spacing stays stable
// regardless of layout scale. Tighter for parts (visually busier shape area),
// looser for offcut/scrap so the callout text can sit on top of the hatch
// without competing with it.
const HATCH_SPACING_PART_MM = 1.6
const HATCH_SPACING_REGION_MM = 2.4
const HATCH_LINE_WIDTH_MM = 0.12

// Dimension annotation gutters around the diagram (matches the target
// blueprint look — width arrow on the right, length arrow at the bottom).
const DIM_GUTTER_RIGHT_MM = 12
const DIM_GUTTER_BOTTOM_MM = 12
const DIM_ARROW_HEAD_MM = 1.6

// Label sizing: drop a hard pt floor so tiny boxes don't get oversized text
// that bleeds into adjacent shapes. Skip the label entirely when even the
// minimum readable size won't fit both the box width AND height.
const LABEL_PAD_MM = 0.35
const MIN_LABEL_FONT_PT = 2.5
const MAX_LABEL_FONT_PT = 10
const PT_TO_MM = 25.4 / 72

// ── Logo Loader ──────────────────────────────────────────────────────────────

let cachedLogo: string | null = null

function getLogo(): string {
  if (!cachedLogo) {
    cachedLogo = `data:image/jpeg;base64,${ARC_ANCHOR_LOGO_BASE64}`
  }
  return cachedLogo
}

// ── SVG Print-Color Swaps ────────────────────────────────────────────────────

const PRINT_SWAPS: Array<{ sel: string; attr: string; from: string; to: string }> = [
  { sel: "line[stroke='#d6d3d1']", attr: "stroke", from: "#d6d3d1", to: "#1f2937" },
  { sel: "path[fill='#d6d3d1']", attr: "fill", from: "#d6d3d1", to: "#1f2937" },
  { sel: "text[fill='#ffffff']", attr: "fill", from: "#ffffff", to: "#1f2937" },
  { sel: "text[fill='#f5f5f4']", attr: "fill", from: "#f5f5f4", to: "#374151" },
  { sel: "rect[stroke='#d6d3d1']", attr: "stroke", from: "#d6d3d1", to: "#1f2937" },
]

// ── SVG Rasterisation (4x, print-friendly colors) ───────────────────────────

async function rasterizeSvg(svg: SVGSVGElement): Promise<string> {
  const originalViewBox = svg.getAttribute("viewBox")
  const vw = svg.viewBox.baseVal.width || svg.clientWidth
  const vh = svg.viewBox.baseVal.height || svg.clientHeight
  svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`)

  // Swap dark-mode colors to print-friendly
  const originals: Array<{ el: Element; attr: string; value: string }> = []
  for (const swap of PRINT_SWAPS) {
    svg.querySelectorAll(swap.sel).forEach((el) => {
      const cur = el.getAttribute(swap.attr)
      if (cur === swap.from) {
        originals.push({ el, attr: swap.attr, value: cur })
        el.setAttribute(swap.attr, swap.to)
      }
    })
  }

  // Dimension labels contain inch marks (") — tag letters inside shapes don't
  svg.querySelectorAll("text[fill='#e7e5e4']").forEach((el) => {
    const text = el.textContent ?? ""
    if (text.includes('"')) {
      originals.push({ el, attr: "fill", value: "#e7e5e4" })
      el.setAttribute("fill", "#1f2937")
    }
  })

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(svg)
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.src = url
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("SVG rasterization failed"))
  })

  const scale = 4
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth * scale
  canvas.height = img.naturalHeight * scale
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Canvas context unavailable")
  ctx.scale(scale, scale)
  ctx.drawImage(img, 0, 0)
  URL.revokeObjectURL(url)

  // Restore originals
  for (const o of originals) o.el.setAttribute(o.attr, o.value)
  if (originalViewBox) svg.setAttribute("viewBox", originalViewBox)

  return canvas.toDataURL("image/png")
}

// ── Page Break Helper ────────────────────────────────────────────────────────

function checkNewPage(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > PAGE_H - 20) {
    doc.addPage()
    return 20
  }
  return y
}

// ── Section Renderers ────────────────────────────────────────────────────────

function addHeader(doc: jsPDF, data: CutPdfData, logo: string): number {
  let y = 15

  doc.addImage(logo, "JPEG", MARGIN, y - 3, 10, 10)
  doc.setFontSize(14)
  doc.setTextColor(...BRAND)
  doc.setFont("helvetica", "bold")
  doc.text("Rubberfit Pro", MARGIN + 13, y + 3)
  y += 13

  doc.setFontSize(20)
  doc.setTextColor(...GRAY_900)
  doc.text("Cut Report", MARGIN, y)
  y += 8

  doc.setFontSize(10)
  doc.setTextColor(...GRAY_500)
  doc.setFont("helvetica", "normal")
  doc.text(format(new Date(data.cutDate), "MMMM dd, yyyy  HH:mm"), MARGIN, y)
  y += 4

  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  y += 5

  return y
}

function addSummaryCards(doc: jsPDF, data: CutPdfData, y: number): number {
  y = checkNewPage(doc, y, 32)
  const cardW = (CONTENT_W - 4 * 3) / 5
  const cardH = 20
  const gap = 3

  const cards = [
    { label: "Cut Pieces", value: `${data.cutPieces}` },
    { label: "Material Used", value: `${data.materialUsedSqFt.toFixed(1)} sqft` },
    { label: "Reusable Offcut", value: `${data.reusableOffcutPct.toFixed(1)}%` },
    { label: "Waste", value: `${data.scrapPct.toFixed(1)}%` },
    { label: "Fab Score", value: `${Math.round(data.fabScore * 100)}/100` },
  ]

  for (let i = 0; i < cards.length; i++) {
    const x = MARGIN + i * (cardW + gap)
    doc.setFillColor(...GRAY_50)
    doc.setDrawColor(...GRAY_200)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD")
    doc.setFontSize(7)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    doc.text(cards[i].label.toUpperCase(), x + cardW / 2, y + 7, { align: "center" })
    doc.setFontSize(13)
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(cards[i].value, x + cardW / 2, y + 15, { align: "center" })
  }

  y += cardH + 6
  doc.setFontSize(9)
  doc.setTextColor(...GRAY_700)
  doc.setFont("helvetica", "normal")
  const rollLabel = data.rollCount > 1 ? `${data.rollCount} rolls` : "1 roll"
  doc.text(
    `${data.profileTitle}  |  Stock: ${data.stockWidth}" \u00D7 ${data.stockLength}" \u00D7 ${data.stockThickness}"  |  ${data.materialName}  |  ${rollLabel}`,
    MARGIN,
    y
  )
  y += 10

  return y
}

function addCutLegend(doc: jsPDF, tagMap: Map<string, string>, y: number): number {
  if (tagMap.size === 0) return y
  const entries = Array.from(tagMap.entries())
    .map(([tag, label]) => ({ tag, label }))
    .sort((a, b) => a.tag.localeCompare(b.tag))
  const cols = 3
  const colW = CONTENT_W / cols
  const rowH = 4.5
  const rows = Math.ceil(entries.length / cols)
  const needed = 12 + rows * rowH
  y = checkNewPage(doc, y, needed)

  doc.setFontSize(11)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text("Cut Legend", MARGIN, y)
  y += 6

  // Column headers
  doc.setFillColor(...GRAY_50)
  doc.rect(MARGIN, y - 3.5, CONTENT_W, 5, "F")
  doc.setFontSize(7)
  doc.setTextColor(...GRAY_500)
  doc.setFont("helvetica", "normal")
  for (let c = 0; c < cols; c++) {
    const cx = MARGIN + c * colW
    doc.text("TAG", cx + 2, y)
    doc.text("DIMENSIONS", cx + 12, y)
  }
  y += 4

  // Entries in column-major order
  doc.setFontSize(8)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = c * rows + r
      if (idx >= entries.length) continue
      const cx = MARGIN + c * colW
      doc.setTextColor(...GRAY_900)
      doc.setFont("helvetica", "bold")
      doc.text(entries[idx].tag, cx + 3, y)
      doc.setTextColor(...GRAY_700)
      doc.setFont("helvetica", "normal")
      doc.text(entries[idx].label, cx + 12, y)
    }
    y += rowH
  }

  y += 4
  return y
}

// ── Vector Layout Rendering ──────────────────────────────────────────────────

/**
 * Render a single `LayoutModel` to the PDF in blueprint style: true-aspect
 * single panel (no segmentation), 45° hatched fills per region category, and
 * dimension arrows on the right (width) + bottom (length) gutters.
 *
 * `boxX/boxY/boxW/boxH` is the TOTAL budget (diagram + dimension gutters).
 * The diagram itself sits in the top-left of that box and is scaled to
 * preserve the layout's true aspect ratio — long rolls render flat (vector
 * zoom keeps them legible).
 */
function renderLayoutToDoc(
  doc: jsPDF,
  layout: LayoutModel,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  offcutRows: ReadonlyArray<OffcutSummaryRow>
): void {
  const sheetW = layout.sheetWidth
  const sheetL = layout.sheetLength
  if (sheetW <= 0 || sheetL <= 0) return

  // Reserve gutters for the dimension annotations.
  const diagramMaxW = Math.max(1, boxW - DIM_GUTTER_RIGHT_MM)
  const diagramMaxH = Math.max(1, boxH - DIM_GUTTER_BOTTOM_MM)
  const scale = Math.min(diagramMaxW / sheetW, diagramMaxH / sheetL)
  const drawW = sheetW * scale
  const drawH = sheetL * scale
  // Anchor to the top-left of the available box so the dimension arrows on
  // the right + bottom always sit at predictable offsets.
  const ox = boxX
  const oy = boxY

  // Sheet background — soft fill so hatched regions read on top of it.
  doc.setFillColor(255, 255, 255)
  doc.rect(ox, oy, drawW, drawH, "F")

  // Clip body content so any geometric drift never bleeds into the gutters.
  // The `null` style arg is critical: with the default (undefined) jsPDF
  // emits `re S` first (path + stroke), so the clip rect itself would draw
  // a visible navy outline using whatever the current draw color happens to
  // be. `null` produces just the path operator (`re W n`), the canonical
  // jsPDF clipping idiom. Same applies to every other `.clip().discardPath()`
  // call below (region rect, ellipse, polygon, label box).
  doc.saveGraphicsState()
  doc.rect(ox, oy, drawW, drawH, null).clip().discardPath()

  // Paint order matches `NestingVizSimpleMode` (the on-screen autonest
  // renderer): scrap UNDER, offcut OVER, parts on top. The data lets a
  // scrap region cover the same area as an offcut region; the renderer's
  // overlap-resolution rule is "offcut wins" so reusable area always
  // displays as reusable.

  // Scrap / waste (red) — drawn first so offcut can overlay.
  for (const region of layout.scrap) {
    drawHatchedRegion(doc, region, ox, oy, scale, {
      fill: SCRAP_FILL_RGB,
      hatch: SCRAP_HATCH_RGB,
      stroke: SCRAP_STROKE_RGB,
      hatchSpacingMm: HATCH_SPACING_REGION_MM,
    })
  }
  // Reusable offcut (amber) — drawn over scrap. Hatch is anchored to a
  // GLOBAL grid (see drawHatchInBounds) so adjacent regions share
  // continuous diagonals — no visible seam at boundaries.
  for (const region of layout.offcuts) {
    drawHatchedRegion(doc, region, ox, oy, scale, {
      fill: OFFCUT_FILL_RGB,
      hatch: OFFCUT_HATCH_RGB,
      stroke: OFFCUT_STROKE_RGB,
      hatchSpacingMm: HATCH_SPACING_REGION_MM,
    })
  }

  // Parts (single green hatch — they are all "shape", distinguished by tag
  // letter rather than by spec color).
  for (const part of layout.parts) {
    drawHatchedPart(doc, part, ox, oy, scale)
  }

  doc.restoreGraphicsState()

  // Sheet border — drawn last and OUTSIDE the clip so it sits cleanly on
  // top of all content. Adaptive line width keeps a border proportional to
  // the panel height (a 0.3mm stroke would dominate a 4mm-tall flat roll).
  doc.setDrawColor(...SHEET_STROKE_RGB)
  doc.setLineWidth(Math.min(0.25, Math.max(0.08, drawH * 0.04)))
  doc.rect(ox, oy, drawW, drawH, "S")

  // Offcut markers — one numbered chip per individually-reusable offcut.
  // The number ties each marker on the diagram to a row in the summary
  // table emitted by `addOffcutSummary`. Single-digit chips fit inside
  // small regions where the previous "Reusable offcut\nW × L" callout
  // would have stacked or overflowed; oversized rows are filtered to
  // operator-actionable pieces upstream by `buildOffcutSummary`.
  for (const row of offcutRows) {
    drawOffcutMarker(doc, row, ox, oy, scale)
  }

  // Dimension annotations on the right (width) + bottom (length) edges.
  drawDimensionArrows(doc, ox, oy, drawW, drawH, sheetW, sheetL)
}

interface RegionStyle {
  fill: RGB
  hatch: RGB
  stroke: RGB
  hatchSpacingMm: number
}

function drawHatchedRegion(
  doc: jsPDF,
  region: LayoutRegion,
  ox: number,
  oy: number,
  scale: number,
  style: RegionStyle
): void {
  if (region.polygon && region.polygon.length >= 3) {
    doc.setFillColor(...style.fill)
    drawPolygon(doc, region.polygon, ox, oy, scale, "F")
    doc.saveGraphicsState()
    polygonAsClipPath(doc, region.polygon, ox, oy, scale)
    const bbox = polygonBoundingBox(region.polygon, ox, oy, scale)
    drawHatchInBounds(doc, bbox.x, bbox.y, bbox.w, bbox.h, style.hatch, style.hatchSpacingMm)
    doc.restoreGraphicsState()
    return
  }
  const rx = ox + region.x * scale
  const ry = oy + region.y * scale
  const rw = region.width * scale
  const rh = region.height * scale
  if (rw <= 0 || rh <= 0) return
  drawHatchedRect(doc, rx, ry, rw, rh, style)
}

/**
 * Draw a small numbered chip at the centroid of an offcut region. The
 * chip is a filled amber circle with the row number in white bold text.
 *
 * Placement logic:
 *   - If the region fits a full chip in both dimensions: draw inside,
 *     centered.
 *   - If the region is too thin in one axis (common for long narrow
 *     strips like 6"×60"): place the chip just outside the long edge
 *     so the marker stays visible even when the strip is sub-millimeter
 *     in PDF mm space. A small connector line links the chip back to
 *     the region so the operator can tell which strip it labels.
 */
function drawOffcutMarker(
  doc: jsPDF,
  row: OffcutSummaryRow,
  ox: number,
  oy: number,
  scale: number
): void {
  const region = row.region
  const rw = region.width * scale
  const rh = region.height * scale
  if (rw <= 0 || rh <= 0) return

  // Compact chip: 1.4mm single digit, 1.7mm two-digit. The PDF is
  // vector — operators zoom to read fine markers — so we trade
  // physical legibility at print scale for visual lightness on the
  // diagram. The chip always sits ON the offcut zone (centered on the
  // canonical rect), even when it overflows the zone's bounds. No
  // stems, no anchors outside the zone.
  const radius = row.number >= 10 ? 1.7 : 1.4

  const cx = ox + region.x * scale + rw / 2
  const cy = oy + region.y * scale + rh / 2

  doc.setFillColor(...OFFCUT_STROKE_RGB) // amber-700 fill — pops against amber-100 region
  doc.setDrawColor(...OFFCUT_STROKE_RGB)
  doc.setLineWidth(0.15)
  doc.ellipse(cx, cy, radius, radius, "FD")

  // Font scales with the chip. 5pt is the floor that still resolves
  // crisply at 200% zoom; the chip is small enough to need it.
  doc.setFontSize(row.number >= 10 ? 4.5 : 5)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(...WHITE)
  doc.text(String(row.number), cx, cy + (row.number >= 10 ? 0.55 : 0.6), { align: "center" })
}

function drawHatchedRect(
  doc: jsPDF,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  style: RegionStyle,
  options: { stroke: boolean } = { stroke: false }
): void {
  doc.setFillColor(...style.fill)
  doc.rect(rx, ry, rw, rh, "F")
  doc.saveGraphicsState()
  doc.rect(rx, ry, rw, rh, null).clip().discardPath()
  drawHatchInBounds(doc, rx, ry, rw, rh, style.hatch, style.hatchSpacingMm)
  doc.restoreGraphicsState()
  // Stroke only when caller requests it. Parts ask for it (need a visible
  // separator between adjacent same-color rectangles); offcut/scrap regions
  // skip it (the fill alone distinguishes them and stacked outlines on
  // adjacent bands produced visible "stripes" through the offcut area).
  if (options.stroke) {
    doc.setDrawColor(...style.stroke)
    doc.setLineWidth(0.2)
    doc.rect(rx, ry, rw, rh, "S")
  }
}

/**
 * Fill `[bx, by, bw, bh]` with parallel 45° lines. Caller must have set up
 * a clip region equal to the target shape — these lines paint across the
 * bounding box and rely on the clip to stay inside the shape.
 *
 * Hatch positions snap to a GLOBAL grid (`c = step * k` in absolute PDF mm
 * coordinates), so adjacent regions whose bounding boxes don't overlap still
 * draw lines on the same anchor. Without that, two stacked offcut bands
 * each compute their hatch from their own local origin — the diagonal lines
 * don't continue across the boundary, and the resulting phase shift reads
 * as a hard horizontal seam between regions.
 */
function drawHatchInBounds(
  doc: jsPDF,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  hatch: RGB,
  spacingMm: number
): void {
  if (bw <= 0 || bh <= 0 || spacingMm <= 0) return
  doc.setDrawColor(...hatch)
  doc.setLineWidth(HATCH_LINE_WIDTH_MM)
  // Parametrize each line as `(t + c, t)` for parameter `t`: 45° slope, where
  // the line `x - y = c` is uniquely identified by its absolute offset `c`.
  // Step `c` by `spacing * √2` (perpendicular spacing) on a global grid.
  const step = spacingMm * Math.SQRT2
  const cMin = bx - (by + bh)
  const cMax = bx + bw - by
  const firstC = Math.ceil(cMin / step) * step
  for (let c = firstC; c <= cMax; c += step) {
    // Intersect the line `(t + c, t)` with the rect [bx..bx+bw] × [by..by+bh].
    const tMin = Math.max(bx - c, by)
    const tMax = Math.min(bx + bw - c, by + bh)
    if (tMin >= tMax) continue
    doc.line(tMin + c, tMin, tMax + c, tMax)
  }
}

function drawHatchedPart(
  doc: jsPDF,
  part: PlacedPart,
  ox: number,
  oy: number,
  scale: number
): void {
  const px = ox + part.x * scale
  const py = oy + part.y * scale
  const pw = part.width * scale
  const ph = part.height * scale
  const cx = px + pw / 2
  const cy = py + ph / 2
  if (pw <= 0 || ph <= 0) return

  const style: RegionStyle = {
    fill: PART_FILL_RGB,
    hatch: PART_HATCH_RGB,
    stroke: PART_STROKE_RGB,
    hatchSpacingMm: HATCH_SPACING_PART_MM,
  }

  if (part.renderShape === "circle" && part.diameter != null) {
    const r = (part.diameter / 2) * scale
    doc.setFillColor(...style.fill)
    doc.ellipse(cx, cy, r, r, "F")
    doc.saveGraphicsState()
    doc.ellipse(cx, cy, r, r, null).clip().discardPath()
    drawHatchInBounds(doc, cx - r, cy - r, r * 2, r * 2, style.hatch, style.hatchSpacingMm)
    doc.restoreGraphicsState()
    doc.setDrawColor(...style.stroke)
    doc.setLineWidth(0.25)
    doc.ellipse(cx, cy, r, r, "S")
  } else if (part.polygon && part.polygon.length >= 3) {
    doc.setFillColor(...style.fill)
    drawPolygon(doc, part.polygon, ox, oy, scale, "F")
    doc.saveGraphicsState()
    polygonAsClipPath(doc, part.polygon, ox, oy, scale)
    const bbox = polygonBoundingBox(part.polygon, ox, oy, scale)
    drawHatchInBounds(doc, bbox.x, bbox.y, bbox.w, bbox.h, style.hatch, style.hatchSpacingMm)
    doc.restoreGraphicsState()
    doc.setDrawColor(...style.stroke)
    doc.setLineWidth(0.25)
    drawPolygon(doc, part.polygon, ox, oy, scale, "S")
  } else {
    drawHatchedRect(doc, px, py, pw, ph, style, { stroke: true })
  }

  // Label — shrink to fit both width AND height. Skip when even the minimum
  // readable size won't fit. Black on the light fill (the previous white-on-
  // colored scheme is no longer needed since fills are uniformly soft).
  const labelFontPt = getFittingLabelFontPt(doc, part.label, pw, ph)
  if (labelFontPt == null) return
  doc.saveGraphicsState()
  doc.rect(px, py, pw, ph, null).clip().discardPath()
  doc.setFontSize(labelFontPt)
  doc.setTextColor(...LABEL_TEXT_RGB)
  doc.setFont("helvetica", "bold")
  doc.text(part.label, cx, cy + (labelFontPt * PT_TO_MM) / 3, { align: "center" })
  doc.restoreGraphicsState()
}

function polygonBoundingBox(
  polygon: Array<{ x: number; y: number }>,
  ox: number,
  oy: number,
  scale: number
): { x: number; y: number; w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const pt of polygon) {
    const px = ox + pt.x * scale
    const py = oy + pt.y * scale
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function polygonAsClipPath(
  doc: jsPDF,
  polygon: Array<{ x: number; y: number }>,
  ox: number,
  oy: number,
  scale: number
): void {
  if (polygon.length < 3) return
  const first = polygon[0]
  const segments = polygon.slice(1).map((pt, i) => {
    const prev = polygon[i]
    return [(pt.x - prev.x) * scale, (pt.y - prev.y) * scale] as [number, number]
  })
  // Trace the polygon as a path with `style=null` so jsPDF doesn't auto-stroke
  // it before the clip (the default `undefined` style emits an `S` operator
  // which produces visible strokes around every clipped region).
  doc.lines(segments, ox + first.x * scale, oy + first.y * scale, [1, 1], null, true)
  doc.clip().discardPath()
}

/**
 * Compute the largest font size (in pt) at which `label` fits inside a
 * `boxW × boxH` mm box, leaving `LABEL_PAD_MM` of padding on each side.
 * Returns `null` when even `MIN_LABEL_FONT_PT` won't fit — caller should
 * skip the label rather than draw something that overflows.
 */
function getFittingLabelFontPt(
  doc: jsPDF,
  label: string,
  boxW: number,
  boxH: number
): number | null {
  const availW = boxW - LABEL_PAD_MM * 2
  const availH = boxH - LABEL_PAD_MM * 2
  if (availW <= 0 || availH <= 0) return null

  doc.setFont("helvetica", "bold")
  doc.setFontSize(1)
  const widthAt1Pt = doc.getTextWidth(label)
  if (widthAt1Pt <= 0) return null

  // jsPDF returns text width in mm at the active font size, so width-at-1pt
  // gives us a per-pt mm/pt ratio. Cap by both axes so a thin tall box can't
  // get a font that overflows horizontally and vice versa.
  const fontPt = Math.min(MAX_LABEL_FONT_PT, availW / widthAt1Pt, availH / PT_TO_MM)
  return fontPt >= MIN_LABEL_FONT_PT ? fontPt : null
}

function formatInch(value: number): string {
  // Round to the nearest 1/16" then drop trailing zeros: 12.0 → "12"",
  // 7.5 → "7.5"", 12.0625 → "12.0625"".
  const stepped = Math.round(value * 16) / 16
  const text = Number.isInteger(stepped) ? `${stepped}` : `${stepped.toFixed(4).replace(/0+$/, "")}`
  return `${text}"`
}

function drawDimensionArrows(
  doc: jsPDF,
  ox: number,
  oy: number,
  drawW: number,
  drawH: number,
  sheetWidthIn: number,
  sheetLengthIn: number
): void {
  doc.setDrawColor(...SHEET_STROKE_RGB)
  doc.setLineWidth(0.25)
  doc.setFillColor(...SHEET_STROKE_RGB)

  // Width arrow — vertical, sits in the right gutter, spans the panel height.
  const widthArrowX = ox + drawW + 4
  const widthArrowY1 = oy
  const widthArrowY2 = oy + drawH
  doc.line(widthArrowX, widthArrowY1, widthArrowX, widthArrowY2)
  drawArrowhead(doc, widthArrowX, widthArrowY1, "up")
  drawArrowhead(doc, widthArrowX, widthArrowY2, "down")
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...LABEL_TEXT_RGB)
  // Sideways label sits to the right of the arrow. Keep horizontal so it
  // reads at default PDF orientation; jsPDF's rotated text is fragile.
  doc.text(`${formatInch(sheetWidthIn)} width`, widthArrowX + 2, oy + drawH / 2 + 2)

  // Length arrow — horizontal, sits in the bottom gutter, spans the panel width.
  const lengthArrowY = oy + drawH + 4
  const lengthArrowX1 = ox
  const lengthArrowX2 = ox + drawW
  doc.line(lengthArrowX1, lengthArrowY, lengthArrowX2, lengthArrowY)
  drawArrowhead(doc, lengthArrowX1, lengthArrowY, "left")
  drawArrowhead(doc, lengthArrowX2, lengthArrowY, "right")
  doc.text(`${formatInch(sheetLengthIn)} length`, ox + drawW / 2, lengthArrowY + 5, {
    align: "center",
  })
}

function drawArrowhead(
  doc: jsPDF,
  tipX: number,
  tipY: number,
  direction: "up" | "down" | "left" | "right"
): void {
  const s = DIM_ARROW_HEAD_MM
  let segments: Array<[number, number]>
  switch (direction) {
    case "up":
      segments = [
        [-s / 2, s],
        [s, 0],
        [-s / 2, -s],
      ]
      break
    case "down":
      segments = [
        [-s / 2, -s],
        [s, 0],
        [-s / 2, s],
      ]
      break
    case "left":
      segments = [
        [s, -s / 2],
        [0, s],
        [-s, -s / 2],
      ]
      break
    case "right":
      segments = [
        [-s, -s / 2],
        [0, s],
        [s, -s / 2],
      ]
      break
  }
  doc.lines(segments, tipX, tipY, [1, 1], "F", true)
}

function drawPolygon(
  doc: jsPDF,
  polygon: Array<{ x: number; y: number }>,
  ox: number,
  oy: number,
  scale: number,
  style: "F" | "FD" | "S"
): void {
  if (polygon.length < 3) return
  const first = polygon[0]
  const segments = polygon.slice(1).map((pt, i) => {
    const prev = polygon[i]
    return [(pt.x - prev.x) * scale, (pt.y - prev.y) * scale] as [number, number]
  })
  doc.lines(segments, ox + first.x * scale, oy + first.y * scale, [1, 1], style, true)
}

async function addLayoutDiagrams(
  doc: jsPDF,
  layouts: LayoutModel[],
  offcutSummary: ReadonlyArray<OffcutSummaryRow>,
  y: number
): Promise<number> {
  for (let i = 0; i < layouts.length; i++) {
    const layout = layouts[i]
    if (layout.sheetWidth <= 0 || layout.sheetLength <= 0) continue
    const showRollHeader = layouts.length > 1

    // True-aspect sizing: scale to fit CONTENT_W minus the dimension gutter,
    // then derive the panel height from the layout's actual aspect ratio.
    // Long rolls render flat — vector zoom keeps them legible.
    const diagramMaxW = Math.max(1, CONTENT_W - DIM_GUTTER_RIGHT_MM)
    const aspect = layout.sheetLength / layout.sheetWidth
    const drawW = diagramMaxW
    const drawH = drawW * aspect
    const boxH = drawH + DIM_GUTTER_BOTTOM_MM
    const boxW = CONTENT_W

    y = renderRollHeader(doc, y, {
      show: showRollHeader,
      rollIndex: i,
      rollTotal: layouts.length,
      panelHeightMm: boxH,
    })
    const rollOffcuts = offcutSummary.filter((row) => row.rollIndex === i + 1)
    renderLayoutToDoc(doc, layout, MARGIN, y, boxW, boxH, rollOffcuts)
    y += boxH + 8
  }
  return y
}

interface RollHeaderArgs {
  show: boolean
  rollIndex: number
  rollTotal: number
  panelHeightMm: number
}

function renderRollHeader(doc: jsPDF, y: number, args: RollHeaderArgs): number {
  const headerHeight = args.show ? 8 : 0
  const reserved = headerHeight + args.panelHeightMm + 8
  y = checkNewPage(doc, y, reserved)
  if (!args.show) return y

  doc.setFontSize(10)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text(`Roll ${args.rollIndex + 1} of ${args.rollTotal}`, MARGIN, y + 3)
  return y + headerHeight
}

async function addDiagrams(doc: jsPDF, svgElements: SVGSVGElement[], y: number): Promise<number> {
  for (let i = 0; i < svgElements.length; i++) {
    const svg = svgElements[i]
    const vw = svg.viewBox.baseVal.width || svg.clientWidth || 980
    const vh = svg.viewBox.baseVal.height || svg.clientHeight || 560
    const aspectRatio = vh / vw
    const imgW = CONTENT_W
    const imgH = imgW * aspectRatio

    y = checkNewPage(doc, y, imgH + 12)

    if (svgElements.length > 1) {
      doc.setFillColor(...BRAND)
      doc.rect(MARGIN, y - 1, 2, 6, "F")
      doc.setFontSize(10)
      doc.setTextColor(...GRAY_900)
      doc.setFont("helvetica", "bold")
      doc.text(`Roll ${i + 1} of ${svgElements.length}`, MARGIN + 5, y + 3)
      y += 8
    }

    const imgData = await rasterizeSvg(svg)
    doc.addImage(imgData, "PNG", MARGIN, y, imgW, imgH)
    y += imgH + 6
  }
  return y
}

/**
 * Render a Reusable Offcut Summary section listing every individually
 * reusable offcut across all rolls. Each row's number ties back to a
 * numbered chip drawn on the diagram by `drawOffcutMarker`. Operators
 * use this to plan strip recovery without having to read dimensions
 * off the rendered layout.
 */
function addOffcutSummary(doc: jsPDF, rows: ReadonlyArray<OffcutSummaryRow>, y: number): number {
  if (rows.length === 0) return y
  const showRoll = rows.some((r) => r.rollTotal > 1)

  y = checkNewPage(doc, y, 24)

  doc.setFontSize(11)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text("Reusable Offcuts", MARGIN, y)
  y += 6

  // Column allocation: # / Roll / Location / Size / Area / Type. The
  // Roll column collapses out for single-roll exports so dimensions get
  // more room. Numeric column proportions chosen to keep all values
  // single-line at the standard 9pt body font.
  const cols = showRoll
    ? [
        { label: "#", width: 0.06 },
        { label: "ROLL", width: 0.1 },
        { label: "LOCATION", width: 0.24 },
        { label: "SIZE", width: 0.24 },
        { label: "AREA", width: 0.16 },
        { label: "TYPE", width: 0.2 },
      ]
    : [
        { label: "#", width: 0.07 },
        { label: "LOCATION", width: 0.27 },
        { label: "SIZE", width: 0.27 },
        { label: "AREA", width: 0.18 },
        { label: "TYPE", width: 0.21 },
      ]
  const widths = cols.map((c) => c.width * CONTENT_W)

  const drawHeader = (headerY: number): number => {
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, headerY - 3.5, CONTENT_W, 6, "F")
    doc.setFontSize(8)
    doc.setTextColor(...WHITE)
    doc.setFont("helvetica", "bold")
    let cx = MARGIN + 3
    for (let i = 0; i < cols.length; i++) {
      doc.text(cols[i].label, cx, headerY)
      cx += widths[i]
    }
    return headerY + 5
  }

  y = drawHeader(y)

  for (let i = 0; i < rows.length; i++) {
    const beforePageCheck = y
    y = checkNewPage(doc, y, 6)
    if (y !== beforePageCheck) y = drawHeader(y)
    // Body font size is re-applied per row so the page-break re-draw
    // of the header (size 8) doesn't leak into the next body row.
    doc.setFontSize(9)

    const row = rows[i]
    if (i % 2 === 0) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y - 3.5, CONTENT_W, 5.5, "F")
    }
    let x = MARGIN + 3
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(String(row.number), x, y)
    x += widths[0]
    if (showRoll) {
      doc.setTextColor(...GRAY_700)
      doc.setFont("helvetica", "normal")
      doc.text(`${row.rollIndex} / ${row.rollTotal}`, x, y)
      x += widths[1]
    }
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(`${formatInch(row.region.x)}, ${formatInch(row.region.y)}`, x, y)
    x += widths[showRoll ? 2 : 1]
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(`${formatInch(row.region.width)} × ${formatInch(row.region.height)}`, x, y)
    x += widths[showRoll ? 3 : 2]
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "normal")
    doc.text(`${row.areaSqFt.toFixed(2)} sqft`, x, y)
    x += widths[showRoll ? 4 : 3]
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(row.type, x, y)
    y += 5.5
  }

  y += 4
  return y
}

function addMetrics(doc: jsPDF, data: CutPdfData, y: number): number {
  y = checkNewPage(doc, y, 50)
  doc.setFontSize(11)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text("Metrics", MARGIN, y)
  y += 6

  const rollNote = data.rollCount > 1 ? ` across ${data.rollCount} rolls` : ""
  const metrics = [
    ["Parts Completed", `${data.partsCompleted}${rollNote}`],
    ["Material Used", `${data.materialUsedSqFt.toFixed(2)} sq ft`],
    ["Reusable Offcut", `${data.reusableOffcutSqFt.toFixed(2)} sq ft`],
    ["Scrap / Waste", `${data.scrapSqFt.toFixed(2)} sq ft`],
    ["Cut Pieces", `${data.cutPieces}`],
    ["Fab Score", `${Math.round(data.fabScore * 100)} / 100`],
  ]

  // Header row
  doc.setFillColor(...BRAND)
  doc.rect(MARGIN, y - 3.5, CONTENT_W, 6, "F")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  doc.setFont("helvetica", "bold")
  doc.text("METRIC", MARGIN + 3, y)
  doc.text("VALUE", MARGIN + CONTENT_W / 2, y)
  y += 5

  doc.setFontSize(9)
  for (let i = 0; i < metrics.length; i++) {
    y = checkNewPage(doc, y, 6)
    if (i % 2 === 0) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y - 3.5, CONTENT_W, 5.5, "F")
    }
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(metrics[i][0], MARGIN + 3, y)
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(metrics[i][1], MARGIN + CONTENT_W / 2, y)
    y += 5.5
  }

  y += 4
  return y
}

function addAdhesives(doc: jsPDF, data: CutPdfData, y: number): number {
  if (data.materialUsedSqFt <= 0) return y
  y = checkNewPage(doc, y, 35)

  doc.setFontSize(11)
  doc.setTextColor(...GRAY_900)
  doc.setFont("helvetica", "bold")
  doc.text("Adhesive Requirements", MARGIN, y)
  y += 6

  const pr200 = data.materialUsedSqFt / 380
  const sc4000 = data.materialUsedSqFt / 47
  const e40 = sc4000 * 4
  const adhesives = [
    ["PR200 Primer", `${pr200.toFixed(2)} gal`, "1 gal / 380 sq ft"],
    ["SC4000 Glue", `${sc4000.toFixed(2)} gal`, "1 gal / 47 sq ft"],
    ["E40 Hardener", `${e40.toFixed(2)} units`, "4 units / gal SC4000"],
  ]

  doc.setFillColor(...BRAND)
  doc.rect(MARGIN, y - 3.5, CONTENT_W, 6, "F")
  doc.setFontSize(8)
  doc.setTextColor(...WHITE)
  doc.setFont("helvetica", "bold")
  doc.text("ADHESIVE", MARGIN + 3, y)
  doc.text("AMOUNT", MARGIN + 65, y)
  doc.text("COVERAGE RATE", MARGIN + 115, y)
  y += 5

  doc.setFontSize(9)
  for (let i = 0; i < adhesives.length; i++) {
    y = checkNewPage(doc, y, 6)
    if (i % 2 === 0) {
      doc.setFillColor(...GRAY_50)
      doc.rect(MARGIN, y - 3.5, CONTENT_W, 5.5, "F")
    }
    doc.setTextColor(...GRAY_700)
    doc.setFont("helvetica", "normal")
    doc.text(adhesives[i][0], MARGIN + 3, y)
    doc.setTextColor(...GRAY_900)
    doc.setFont("helvetica", "bold")
    doc.text(adhesives[i][1], MARGIN + 65, y)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    doc.text(adhesives[i][2], MARGIN + 115, y)
    y += 5.5
  }

  y += 4
  return y
}

function addFooter(doc: jsPDF): void {
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...GRAY_200)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, PAGE_H - 15, MARGIN + CONTENT_W, PAGE_H - 15)
    doc.setFontSize(7)
    doc.setTextColor(...GRAY_500)
    doc.setFont("helvetica", "normal")
    const mainFooter = "Rubberfit Pro \u2014 Material Optimization System "
    doc.text(mainFooter, MARGIN, PAGE_H - 10)
    const mainW = doc.getTextWidth(mainFooter)
    doc.setFont("helvetica", "italic")
    doc.text("by Arc and Anchor", MARGIN + mainW, PAGE_H - 10)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" })
  }
}

// ── Main Exports ─────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity
export async function buildAndUploadCutPdf(
  cutId: string,
  stock: StockConfig,
  cutMetrics: SimpleCutMetrics | null,
  selectedTemplate: PartTemplate | undefined,
  selectedTemplates: PartTemplate[],
  tags: Map<string, string>,
  layouts?: LayoutModel[]
) {
  // Prefer vector layout diagrams when available — fall back to legacy DOM SVG
  // scraping only when called without layouts (e.g. very old call sites).
  const useVector = layouts && layouts.length > 0
  const svgElements = useVector
    ? []
    : Array.from(document.querySelectorAll<SVGSVGElement>("[data-sheet-svg]"))
  const rollCount = useVector ? layouts.length : svgElements.length
  if (rollCount === 0) return

  const totalStockSqFt = ((stock.width * stock.length) / 144) * rollCount
  const reusablePct =
    totalStockSqFt > 0 ? ((cutMetrics?.reusableOffsetSqFt ?? 0) / totalStockSqFt) * 100 : 0
  const scrapPct = totalStockSqFt > 0 ? ((cutMetrics?.scrapSqFt ?? 0) / totalStockSqFt) * 100 : 0
  const partLabel =
    PART_OPTIONS.find((p) => p.partType === selectedTemplate?.partType)?.label ?? "Custom"

  const pdfData: CutPdfData = {
    cutId,
    stockWidth: stock.width,
    stockLength: stock.length,
    stockThickness: stock.thickness,
    materialName: stock.material,
    profileTitle: `${partLabel} ${selectedTemplates.length > 1 ? "mixed-size layout" : "layout"}`,
    tagMap: tags,
    partsCompleted: cutMetrics?.partsCompleted ?? 0,
    cutPieces: cutMetrics?.cutPieces ?? 0,
    rollCount,
    materialUsedSqFt: cutMetrics?.materialUsedSqFt ?? 0,
    reusableOffcutSqFt: cutMetrics?.reusableOffsetSqFt ?? 0,
    reusableOffcutPct: reusablePct,
    scrapSqFt: cutMetrics?.scrapSqFt ?? 0,
    scrapPct,
    fabScore: cutMetrics?.fabScore ?? 0,
    cutDate: new Date().toISOString(),
  }

  const pdfBlob = await generateCutPdf({ svgElements, layouts: layouts ?? [], data: pdfData })
  const user = await authService.getCurrentUser()
  if (user) {
    await uploadCutPdf(cutId, user.id, pdfBlob)
  }
}

export async function generateCutPdf(args: {
  svgElements: SVGSVGElement[]
  layouts: LayoutModel[]
  data: CutPdfData
}): Promise<Blob> {
  const { svgElements, layouts, data } = args
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  doc.setProperties({
    title: `Cut Report #${data.cutId}`,
    subject: "Rubberfit Pro Cut Report",
    author: "Rubberfit Pro",
    creator: "Rubberfit Pro",
  })

  const logo = getLogo()
  // Compute the offcut summary once up front so the diagram pass and
  // the table section share the same numbering and filtering.
  const offcutSummary = layouts.length > 0 ? buildOffcutSummary(layouts) : []

  let y = addHeader(doc, data, logo)
  y = addSummaryCards(doc, data, y)
  y = addCutLegend(doc, data.tagMap, y)
  // Vector path when layouts are provided, raster fallback otherwise.
  if (layouts.length > 0) {
    y = await addLayoutDiagrams(doc, layouts, offcutSummary, y)
  } else {
    y = await addDiagrams(doc, svgElements, y)
  }
  y = addOffcutSummary(doc, offcutSummary, y)
  y = addMetrics(doc, data, y)
  addAdhesives(doc, data, y)
  addFooter(doc)

  return doc.output("blob")
}
