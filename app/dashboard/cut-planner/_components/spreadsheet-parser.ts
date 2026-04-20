import * as XLSX from "xlsx"
import type { ExtractedPart, ExtractedPartType } from "./upload-types"

const WIDTH_ALIASES = ["width", "w", "wid", "wide"]
const LENGTH_ALIASES = ["length", "len", "l", "long"]
const QTY_ALIASES = ["quantity", "qty", "count", "pcs", "pieces", "ea", "amount", "amt", "#"]
const PART_ALIASES = [
  "part number",
  "part #",
  "part no",
  "part",
  "item",
  "description",
  "desc",
  "name",
  "label",
  "sku",
]
const SIZE_ALIASES = ["size", "sizes", "dimension", "dimensions", "dim", "dims", "cut", "cut size"]
const DIAMETER_ALIASES = ["diameter", "diam", "dia"]
const HEIGHT_ALIASES = ["height", "h"]
const INNER_RADIUS_ALIASES = [
  "inner radius",
  "innerradius",
  "inner r",
  "inner_r",
  "inner-radius",
]
const OUTER_RADIUS_ALIASES = [
  "outer radius",
  "outerradius",
  "outer r",
  "outer_r",
  "outer-radius",
]
const ARC_DEGREES_ALIASES = [
  "arc degrees",
  "arcdegrees",
  "arc",
  "degrees",
  "arc deg",
  "arc_degrees",
]
const TOP_WIDTH_ALIASES = ["top width", "topwidth", "top w", "top_w", "top-width"]
const BOTTOM_WIDTH_ALIASES = [
  "bottom width",
  "bottomwidth",
  "bottom w",
  "bottom_w",
  "bottom-width",
]
const PART_TYPE_ALIASES = ["part type", "type", "shape", "parttype", "part_type"]

const SHEET_NAME_TO_TYPE: Array<{ pattern: RegExp; type: ExtractedPartType }> = [
  { pattern: /^rect/i, type: "rectangle" },
  { pattern: /^cyl/i, type: "cylinder" },
  { pattern: /^cone/i, type: "cone" },
  { pattern: /^trap/i, type: "trapezoid" },
]

const TYPE_KEYWORDS: Array<{ pattern: RegExp; type: ExtractedPartType }> = [
  { pattern: /rect/i, type: "rectangle" },
  { pattern: /cyl/i, type: "cylinder" },
  { pattern: /cone/i, type: "cone" },
  { pattern: /trap/i, type: "trapezoid" },
]

function matchColumn(header: string, aliases: string[]): boolean {
  const h = header.toLowerCase().trim()
  if (!h) return false
  return aliases.some((a) => {
    if (h === a) return true
    if (a.length <= 2) return false
    return h.startsWith(a + " ") || h.startsWith(a + "(") || h.includes(a)
  })
}

/**
 * Parse fractional inch strings like "11-1/2", "½", "11.5", "11 1/2"
 */
export function parseFractionalInches(raw: string | number): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0
  const s = raw
    .trim()
    .replace(/\u00bd/g, ".5")
    .replace(/\u00bc/g, ".25")
    .replace(/\u00be/g, ".75")
    .replace(/\u2153/g, ".333")
    .replace(/\u2154/g, ".667")
    .replace(/\u215b/g, ".125")
    .replace(/\u215c/g, ".375")
    .replace(/\u215d/g, ".625")
    .replace(/\u215e/g, ".875")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .trim()

  const mixedMatch = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/)
  if (mixedMatch) {
    const denom = Number(mixedMatch[3])
    if (denom === 0) return 0
    const result = Number(mixedMatch[1]) + Number(mixedMatch[2]) / denom
    return Number.isFinite(result) ? result : 0
  }

  const fracMatch = s.match(/^(\d+)\/(\d+)$/)
  if (fracMatch) {
    const denom = Number(fracMatch[2])
    if (denom === 0) return 0
    const result = Number(fracMatch[1]) / denom
    return Number.isFinite(result) ? result : 0
  }

  const num = Number(s)
  return Number.isFinite(num) ? num : 0
}

function parseCombinedDimension(raw: string | number): [number, number] | null {
  if (typeof raw === "number") return null
  const s = String(raw).trim()
  const match = s.match(/^(.+?)\s*[xX×]\s*(.+)$/)
  if (!match) return null
  const w = parseFractionalInches(match[1])
  const l = parseFractionalInches(match[2])
  if (w > 0 && l > 0) return [w, l]
  return null
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (!h || !String(h).trim()) continue
    if (matchColumn(String(h), aliases)) return i
  }
  return -1
}

interface BaseCols {
  qty: number
  partNumber: number
  partType: number
}

interface RectCols extends BaseCols {
  kind: "rectangle"
  width: number
  length: number
  combined: number
}

interface CylinderCols extends BaseCols {
  kind: "cylinder"
  diameter: number
  height: number
}

interface ConeCols extends BaseCols {
  kind: "cone"
  innerRadius: number
  outerRadius: number
  arcDegrees: number
}

interface TrapezoidCols extends BaseCols {
  kind: "trapezoid"
  topWidth: number
  bottomWidth: number
  height: number
}

type ShapeCols = RectCols | CylinderCols | ConeCols | TrapezoidCols

// eslint-disable-next-line complexity -- detects columns for four distinct shape types
function detectColumns(headers: string[], forceType?: ExtractedPartType): ShapeCols | null {
  const qty = findColumnIndex(headers, QTY_ALIASES)
  const partNumber = findColumnIndex(headers, PART_ALIASES)
  const partType = findColumnIndex(headers, PART_TYPE_ALIASES)

  // Shape-specific column detection.
  const innerRadius = findColumnIndex(headers, INNER_RADIUS_ALIASES)
  const outerRadius = findColumnIndex(headers, OUTER_RADIUS_ALIASES)
  const arcDegrees = findColumnIndex(headers, ARC_DEGREES_ALIASES)
  const diameter = findColumnIndex(headers, DIAMETER_ALIASES)
  const topWidth = findColumnIndex(headers, TOP_WIDTH_ALIASES)
  const bottomWidth = findColumnIndex(headers, BOTTOM_WIDTH_ALIASES)
  const height = findColumnIndex(headers, HEIGHT_ALIASES)
  const width = findColumnIndex(headers, WIDTH_ALIASES)
  const length = findColumnIndex(headers, LENGTH_ALIASES)
  const combined = findColumnIndex(headers, SIZE_ALIASES)

  const hasConeCols = innerRadius >= 0 && outerRadius >= 0 && arcDegrees >= 0
  const hasTrapCols = topWidth >= 0 && bottomWidth >= 0 && height >= 0
  const hasCylCols = diameter >= 0 && height >= 0
  const hasRectCols = (width >= 0 && length >= 0) || combined >= 0

  const base = { qty, partNumber, partType }

  // Pick strongest signal. Explicit forceType (from sheet name) is used only
  // when column detection is ambiguous.
  if (hasConeCols) return { kind: "cone", ...base, innerRadius, outerRadius, arcDegrees }
  if (hasTrapCols && !hasCylCols)
    return { kind: "trapezoid", ...base, topWidth, bottomWidth, height }
  if (hasCylCols && !hasTrapCols) return { kind: "cylinder", ...base, diameter, height }
  if (hasRectCols) return { kind: "rectangle", ...base, width, length, combined }

  if (forceType === "cylinder" && diameter >= 0 && height >= 0)
    return { kind: "cylinder", ...base, diameter, height }
  if (forceType === "trapezoid" && topWidth >= 0 && bottomWidth >= 0 && height >= 0)
    return { kind: "trapezoid", ...base, topWidth, bottomWidth, height }

  return null
}

function findHeaderRow(
  rows: string[][],
  forceType?: ExtractedPartType,
  maxScan = 10
): { headerIndex: number; cols: ShapeCols } | null {
  const limit = Math.min(maxScan, rows.length - 1)
  for (let r = 0; r <= limit; r++) {
    const candidate = rows[r].map(String)
    const cols = detectColumns(candidate, forceType)
    if (cols) return { headerIndex: r, cols }
  }
  return null
}

function sheetNameToType(name: string): ExtractedPartType | undefined {
  for (const { pattern, type } of SHEET_NAME_TO_TYPE) {
    if (pattern.test(name.trim())) return type
  }
  return undefined
}

function cellToType(cell: unknown): ExtractedPartType | undefined {
  const s = String(cell ?? "").trim()
  if (!s) return undefined
  for (const { pattern, type } of TYPE_KEYWORDS) {
    if (pattern.test(s)) return type
  }
  return undefined
}

function num(row: string[], col: number): number {
  if (col < 0) return 0
  return parseFractionalInches(row[col] ?? 0)
}

function rowPartNumber(row: string[], col: number): string | undefined {
  if (col < 0) return undefined
  const raw = String(row[col] ?? "").trim()
  return raw || undefined
}

function rowQuantity(row: string[], col: number): number {
  if (col < 0) return 1
  return Math.max(1, Math.round(parseFractionalInches(row[col] ?? 1)))
}

// eslint-disable-next-line complexity -- branches per shape type × required-field validation
function parseRow(
  row: string[],
  cols: ShapeCols,
  sheetType: ExtractedPartType | undefined
): ExtractedPart | null {
  // Per-row Part Type column overrides the sheet-level type.
  const rowType = cellToType(row[cols.partType]) ?? sheetType ?? cols.kind

  const quantity = rowQuantity(row, cols.qty)
  const partNumber = rowPartNumber(row, cols.partNumber)

  if (rowType === "rectangle" && cols.kind === "rectangle") {
    let w = 0
    let l = 0
    if (cols.combined >= 0) {
      const dim = parseCombinedDimension(row[cols.combined] ?? "")
      if (!dim) return null
      ;[w, l] = dim
    } else {
      w = num(row, cols.width)
      l = num(row, cols.length)
    }
    if (w <= 0 || l <= 0) return null
    return { partType: "rectangle", width: w, length: l, quantity, partNumber, confidence: 1 }
  }

  if (rowType === "cylinder" && cols.kind === "cylinder") {
    const diameter = num(row, cols.diameter)
    const height = num(row, cols.height)
    if (diameter <= 0 || height <= 0) return null
    return { partType: "cylinder", diameter, height, quantity, partNumber, confidence: 1 }
  }

  if (rowType === "cone" && cols.kind === "cone") {
    const innerRadius = num(row, cols.innerRadius)
    const outerRadius = num(row, cols.outerRadius)
    const arcDegrees = num(row, cols.arcDegrees)
    if (outerRadius <= 0 || arcDegrees <= 0) return null
    return {
      partType: "cone",
      innerRadius: innerRadius > 0 ? innerRadius : 0,
      outerRadius,
      arcDegrees,
      quantity,
      partNumber,
      confidence: 1,
    }
  }

  if (rowType === "trapezoid" && cols.kind === "trapezoid") {
    const topWidth = num(row, cols.topWidth)
    const bottomWidth = num(row, cols.bottomWidth)
    const height = num(row, cols.height)
    if (topWidth <= 0 || bottomWidth <= 0 || height <= 0) return null
    return {
      partType: "trapezoid",
      topWidth,
      bottomWidth,
      height,
      quantity,
      partNumber,
      confidence: 1,
    }
  }

  return null
}

function parseSheet(
  rows: string[][],
  sheetType: ExtractedPartType | undefined
): ExtractedPart[] {
  if (rows.length < 2) return []
  const found = findHeaderRow(rows, sheetType)
  if (!found) return []
  const { headerIndex, cols } = found

  const parts: ExtractedPart[] = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const part = parseRow(rows[i], cols, sheetType)
    if (part) parts.push(part)
  }
  return parts
}

export async function parseSpreadsheet(file: File): Promise<ExtractedPart[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  if (workbook.SheetNames.length === 0) {
    throw new Error("Spreadsheet contains no sheets.")
  }

  const allParts: ExtractedPart[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })
    const sheetType = sheetNameToType(sheetName)
    const parts = parseSheet(rows, sheetType)
    allParts.push(...parts)
  }

  if (allParts.length === 0) {
    throw new Error(
      "Could not detect any dimension columns. " +
        "Expected headers like: Width/Length, Diameter/Height, Inner Radius/Outer Radius/Arc Degrees, " +
        "or Top Width/Bottom Width/Height. Sheet names like 'Rectangles', 'Cylinders', 'Cones', 'Trapezoids' help disambiguate."
    )
  }

  return allParts
}
