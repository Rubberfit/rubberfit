// Tag-map helpers for the cut-planner — shared between the production
// React component (NestingVisualizer.tsx) and tests/integration code so
// the assertion logic doesn't drift from the runtime behavior.

import type {
  PreviewItem,
  SimplePartPreview,
  MultiSheetResult,
} from "./nesting-visualizer-types"

/**
 * Convert a zero-based index into the alphabetic tag (A, B, …, Z, AA, AB, …).
 */
export function indexToTag(i: number): string {
  let tag = ""
  let n = i
  do {
    tag = String.fromCharCode(65 + (n % 26)) + tag
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return tag
}

/**
 * Build a tag map keyed by `specIndex` (string) → tag value.
 * Uses part numbers (e.g. "G2") when available, falls back to generated
 * letters (A, B, C…). Walks every placed item across all sheets so each
 * unique `specIndex` shows up exactly once in the resulting map.
 */
export function buildTagMap(
  basePreview: SimplePartPreview | null,
  multiSheet: MultiSheetResult | null
): Map<string, string> {
  if (!basePreview) return new Map<string, string>()

  const seenIndices: number[] = []
  const specPartNumbers = new Map<number, string>()
  const collectItem = (item: PreviewItem) => {
    const idx = item.specIndex
    if (idx != null && !seenIndices.includes(idx)) {
      seenIndices.push(idx)
      if (item.partNumber) specPartNumbers.set(idx, item.partNumber)
    }
  }

  if (multiSheet) {
    multiSheet.sheets.forEach((sheet) => sheet.preview.items.forEach(collectItem))
  } else {
    basePreview.items.forEach(collectItem)
  }

  seenIndices.sort((a, b) => a - b)

  let fallbackCounter = 0
  return new Map(
    seenIndices.map((idx) => {
      const partNumber = specPartNumbers.get(idx)
      const tag = partNumber ?? indexToTag(fallbackCounter++)
      return [String(idx), tag]
    })
  )
}
