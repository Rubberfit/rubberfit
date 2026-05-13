// Derives a flat, area-ranked list of every reusable offcut across the
// pack's sheets, tagged R1, R2, R3, … in descending area order. Shared
// by the on-screen "Reusable Offcuts" card and (eventually) the PDF
// report so both surfaces use the same labelling.

import type { LayoutModel, LayoutRegion } from "./layout-model"

export interface TaggedOffcut {
  tag: string
  region: LayoutRegion
  /** 1-indexed standard-sheet number this piece was extracted from. */
  sourceSheetNumber: number
  areaSqIn: number
  areaSqFt: number
}

/**
 * Walk `layouts` once collecting every reusable offcut alongside the
 * standard-sheet number it came from. Promoted offcut-extract sheets
 * carry a single offcut whose source is `parentSheetIndex`; standard
 * sheets carry their remaining (non-promoted) offcuts and report
 * themselves as the source.
 *
 * Returns the list sorted by area descending, tagged R1..Rn.
 */
export function buildTaggedReusableOffcuts(layouts: LayoutModel[]): TaggedOffcut[] {
  const collected: Array<{ region: LayoutRegion; sourceSheetNumber: number }> = []
  let standardCounter = 0

  for (const layout of layouts) {
    if (layout.sheetKind === "offcut-extract") {
      // An offcut-extract sheet without a parentSheetIndex has no
      // provenance to attribute; silently mapping to sheet 1 (the
      // previous behavior) produced wrong source labels in the
      // offcuts card. Skip rather than fabricate. The runtime guard
      // in `isLayoutModel` already rejects frozen rows missing this
      // field, so reaching this branch implies an in-memory adapter
      // bug worth surfacing as missing data.
      if (layout.parentSheetIndex === undefined) {
        if (process.env.NODE_ENV !== "production") {
          // Dev-only warning so an adapter regression that drops
          // parentSheetIndex is observable instead of silently
          // omitting offcuts from the card.
          console.warn(
            "buildTaggedReusableOffcuts: missing parentSheetIndex for offcut-extract layout",
            { layout }
          )
        }
        continue
      }
      const sourceNumber = layout.parentSheetIndex + 1
      for (const region of layout.offcuts) {
        collected.push({ region, sourceSheetNumber: sourceNumber })
      }
      continue
    }
    standardCounter++
    for (const region of layout.offcuts) {
      collected.push({ region, sourceSheetNumber: standardCounter })
    }
  }

  return collected
    .map((c) => {
      const areaSqIn = c.region.width * c.region.height
      return {
        region: c.region,
        sourceSheetNumber: c.sourceSheetNumber,
        areaSqIn,
        areaSqFt: areaSqIn / 144,
      }
    })
    .sort((a, b) => b.areaSqIn - a.areaSqIn)
    .map((entry, i) => ({
      tag: `R${i + 1}`,
      ...entry,
    }))
}

/**
 * Indexes the area-ranked tags by region reference so per-sheet
 * renderers can resolve a band's R-tag without re-running the global
 * sort. Returns a WeakMap so layouts can be garbage-collected without
 * needing an explicit teardown when the operator clears the pack.
 *
 * Relies on `fromLayoutModelToPreview` passing `layout.offcuts` to
 * `SheetPreview.offcutBands` by reference (see layout-model.ts:582) —
 * the SVG renderer reaches a band whose identity matches a LayoutRegion
 * in this map.
 */
export function buildOffcutTagMap(layouts: LayoutModel[]): WeakMap<LayoutRegion, string> {
  const tagged = buildTaggedReusableOffcuts(layouts)
  const map = new WeakMap<LayoutRegion, string>()
  for (const entry of tagged) {
    map.set(entry.region, entry.tag)
  }
  return map
}
