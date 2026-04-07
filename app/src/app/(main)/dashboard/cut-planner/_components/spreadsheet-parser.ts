import * as XLSX from "xlsx"
import type { ExtractedPart } from "./upload-types"

const WIDTH_ALIASES = ["width", "w", "wid"]
const LENGTH_ALIASES = ["length", "len", "l", "height", "h"]
const QTY_ALIASES = ["quantity", "qty", "count", "pcs", "pieces", "ea"]
const PART_ALIASES = [
  "part number",
  "part #",
  "part no",
  "part",
  "item",
  "description",
  "desc",
  "name",
]

function matchColumn(header: string, aliases: string[]): boolean {
  const h = header.toLowerCase().trim()
  return aliases.some((a) => h === a || h.startsWith(a + " ") || h.endsWith(" " + a))
}

/**
 * Parse fractional inch strings like "11-1/2", "½", "11.5", "11 1/2"
 */
export function parseFractionalInches(raw: string | number): number {
  if (typeof raw === "number") return raw
  const s = raw
    .trim()
    .replace(/\u00bd/g, ".5") // ½
    .replace(/\u00bc/g, ".25") // ¼
    .replace(/\u00be/g, ".75") // ¾
    .replace(/\u2153/g, ".333") // ⅓
    .replace(/\u2154/g, ".667") // ⅔
    .replace(/\u215b/g, ".125") // ⅛
    .replace(/\u215c/g, ".375") // ⅜
    .replace(/\u215d/g, ".625") // ⅝
    .replace(/\u215e/g, ".875") // ⅞
    .replace(/"/g, "")
    .replace(/'/g, "")
    .trim()

  // "11-1/2" or "11 1/2"
  const mixedMatch = s.match(/^(\d+)[\s-]+(\d+)\/(\d+)$/)
  if (mixedMatch) {
    return Number(mixedMatch[1]) + Number(mixedMatch[2]) / Number(mixedMatch[3])
  }

  // "1/2"
  const fracMatch = s.match(/^(\d+)\/(\d+)$/)
  if (fracMatch) {
    return Number(fracMatch[1]) / Number(fracMatch[2])
  }

  const num = Number(s)
  return Number.isFinite(num) ? num : 0
}

interface ColumnMap {
  width: number
  length: number
  qty: number
  partNumber: number
}

function detectColumns(headers: string[]): ColumnMap | null {
  let width = -1
  let length = -1
  let qty = -1
  let partNumber = -1

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (width < 0 && matchColumn(h, WIDTH_ALIASES)) width = i
    else if (length < 0 && matchColumn(h, LENGTH_ALIASES)) length = i
    else if (qty < 0 && matchColumn(h, QTY_ALIASES)) qty = i
    else if (partNumber < 0 && matchColumn(h, PART_ALIASES)) partNumber = i
  }

  if (width < 0 || length < 0) return null
  return { width, length, qty, partNumber }
}

export async function parseSpreadsheet(file: File): Promise<ExtractedPart[]> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" })

  if (rows.length < 2) return []

  const headerRow = rows[0].map(String)
  const cols = detectColumns(headerRow)
  if (!cols) {
    throw new Error(
      "Could not detect Width and Length columns. " +
        "Expected headers like: Width, Length, Qty, Part Number"
    )
  }

  const parts: ExtractedPart[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const w = parseFractionalInches(row[cols.width])
    const l = parseFractionalInches(row[cols.length])
    if (w <= 0 || l <= 0) continue

    const q = cols.qty >= 0 ? Math.max(1, Math.round(parseFractionalInches(row[cols.qty]))) : 1
    const pn = cols.partNumber >= 0 ? String(row[cols.partNumber]).trim() : undefined

    parts.push({
      width: w,
      length: l,
      quantity: q,
      partNumber: pn || undefined,
      confidence: 1.0,
    })
  }

  return parts
}
