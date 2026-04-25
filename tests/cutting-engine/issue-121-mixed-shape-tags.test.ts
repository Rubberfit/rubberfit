/**
 * Regression tests for GitHub issue #121 — "Unique Tag Bug" in the cut planner.
 *
 * Three distinct defects covered:
 *   D1 — `regenerate` re-indexes specs across overflow sheets so sheet 2's
 *        items get tags belonging to sheet 1's specs (wrong-tag display).
 *   D2 — `tryGapFillSheet` orphans drop `specIndex` when the gap-filled
 *        spec has no precedent on the current sheet (dimension fallback).
 *   D3 — identity reconciliation by `label` collapses distinct specs that
 *        produce the same display label (e.g. two cones with same arc but
 *        different radii; two same-dim rectangles with different partNumbers).
 *
 * Fix design: every `simpleParts` array passed into the preview pipeline is
 * pre-annotated with a stable `_originalSpecIndex` field. Downstream code
 * stamps `PreviewItem.specIndex = spec._originalSpecIndex ?? specIdx` and
 * reconciles by `_originalSpecIndex`, never collapsing distinct specs.
 */
import { describe, it, expect } from "vitest"
import {
  generateMultiPartPreview,
  computeMultiSheetPreviews,
  globalMultiSheetPack,
} from "@/app/dashboard/cutting-engine/_components/nesting-shape-previews"
import { buildTagMap } from "@/app/dashboard/cutting-engine/_components/nesting-tag-map"
import type {
  SimplePartSpec,
  PreviewItem,
} from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

const ROLL_W = 48
const ROLL_L = 96
const FALLBACK_W = 24
const FALLBACK_H = 12

function rect(
  width: number,
  length: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "rectangle",
    quantity,
    width,
    length,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function cone(
  arcDegrees: number,
  innerRadius: number,
  outerRadius: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "cone",
    quantity,
    arcDegrees,
    innerRadius,
    outerRadius,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function trapezoid(
  topWidth: number,
  bottomWidth: number,
  height: number,
  quantity: number,
  originalIdx: number,
  partNumber?: string
): SimplePartSpec {
  return {
    partType: "trapezoid",
    quantity,
    topWidth,
    bottomWidth,
    height,
    partNumber,
    _originalSpecIndex: originalIdx,
  }
}

function uniqueSpecIndices(items: PreviewItem[]): number[] {
  const set = new Set<number>()
  for (const item of items) {
    if (item.specIndex != null) set.add(item.specIndex)
  }
  return [...set].sort((a, b) => a - b)
}

describe("issue #121 — Defect 1: regenerate must preserve original spec indices", () => {
  it("generateMultiPartPreview honors _originalSpecIndex on every item", () => {
    // Caller has already filtered down to specs originally at positions 1 and 2.
    const specs = [rect(10, 6, 4, 1), rect(8, 8, 4, 2)]
    const preview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)

    expect(preview.items.length).toBeGreaterThan(0)
    const indices = uniqueSpecIndices(preview.items)
    // Items must carry original indices {1, 2}, never the local positions {0, 1}.
    expect(indices).toEqual([1, 2])
    expect(preview.items.every((it) => it.specIndex !== 0)).toBe(true)
  })

  it("multi-sheet regenerate keeps sheet 2 indices stable", () => {
    // Three specs sized so spec[0] dominates sheet 1; spec[1]+spec[2] overflow.
    const specs = [rect(40, 80, 1, 0), rect(10, 6, 12, 1), rect(8, 8, 12, 2)]

    const basePreview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)
    expect(basePreview.overflowUnits).toBeGreaterThan(0)

    const regenerate = (_qty: number, remainingSpecs?: SimplePartSpec[]) =>
      generateMultiPartPreview(
        ROLL_W,
        ROLL_L,
        remainingSpecs ?? specs,
        FALLBACK_W,
        FALLBACK_H
      )

    const multi = computeMultiSheetPreviews(basePreview, ROLL_W, ROLL_L, 4, regenerate, specs)

    expect(multi.sheets.length).toBeGreaterThanOrEqual(2)
    const sheet2Items = multi.sheets[1].preview.items
    expect(sheet2Items.length).toBeGreaterThan(0)

    // Sheet 2 only contains spec[1] and spec[2] — must NOT contain re-indexed 0.
    const sheet2Indices = uniqueSpecIndices(sheet2Items)
    expect(sheet2Indices.every((i) => i === 1 || i === 2)).toBe(true)
    expect(sheet2Indices.includes(0)).toBe(false)
  })
})

describe("issue #121 — Defect 2: gap-fill orphans must keep specIndex", () => {
  it("gap-filled items on a fresh sheet get correct specIndex (no undefined)", () => {
    // Setup: spec[0] is large; spec[1] is small enough to gap-fill into spec[0]'s
    // sheet. After computeMultiSheetPreviews runs gap-fill on overflow sheets,
    // every placed item must carry a defined specIndex.
    const specs = [rect(40, 40, 4, 0), rect(4, 4, 8, 1)]

    const basePreview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)

    const regenerate = (_qty: number, remainingSpecs?: SimplePartSpec[]) =>
      generateMultiPartPreview(
        ROLL_W,
        ROLL_L,
        remainingSpecs ?? specs,
        FALLBACK_W,
        FALLBACK_H
      )

    const multi = computeMultiSheetPreviews(basePreview, ROLL_W, ROLL_L, 4, regenerate, specs)

    for (const sheet of multi.sheets) {
      for (const item of sheet.preview.items) {
        expect(item.specIndex, `item label=${item.label} on sheet ${sheet.sheetIndex}`)
          .not.toBeUndefined()
        // Two specs in scope — every placed/gap-filled item must map to
        // one of them, never to a stale or out-of-range index.
        expect([0, 1]).toContain(item.specIndex)
      }
    }
  })
})

describe("issue #121 — Defect 3: distinct specs with same label must not collapse", () => {
  it("two cone specs with identical arcDegrees but different radii keep distinct indices", () => {
    // Both cones produce label "120° sector"; they MUST stay distinct.
    const specs = [
      cone(120, 1, 4, 3, 0, "C-SMALL"),
      cone(120, 2, 8, 3, 1, "C-LARGE"),
    ]

    const preview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)
    const indices = uniqueSpecIndices(preview.items)
    expect(indices).toEqual([0, 1])

    // Label collision must not erase partNumber: each item carries its own partNumber.
    const partNumbersByIndex = new Map<number, Set<string>>()
    for (const item of preview.items) {
      if (item.specIndex == null || !item.partNumber) continue
      const set = partNumbersByIndex.get(item.specIndex) ?? new Set()
      set.add(item.partNumber)
      partNumbersByIndex.set(item.specIndex, set)
    }
    expect([...(partNumbersByIndex.get(0) ?? [])]).toEqual(["C-SMALL"])
    expect([...(partNumbersByIndex.get(1) ?? [])]).toEqual(["C-LARGE"])
  })

  it("two same-dim rectangles with different partNumbers keep distinct indices", () => {
    const specs = [rect(10, 5, 4, 0, "A1"), rect(10, 5, 4, 1, "A2")]

    const preview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)
    const indices = uniqueSpecIndices(preview.items)
    expect(indices).toEqual([0, 1])
  })
})

describe("issue #121 — hybrid and mixed-NFP packing paths", () => {
  it("trapezoid+rect hybrid path stamps original indices on both shape kinds", () => {
    // Trapezoid + non-trapezoid triggers tryTrapezoidHybridCandidate.
    // skipNfpPacking=false to actually exercise the hybrid path (sync).
    const specs = [trapezoid(8, 12, 6, 4, 0, "T1"), rect(10, 6, 4, 1, "R1")]

    const preview = generateMultiPartPreview(
      ROLL_W,
      ROLL_L,
      specs,
      FALLBACK_W,
      FALLBACK_H,
      false
    )
    expect(preview.items.length).toBeGreaterThan(0)

    const indices = uniqueSpecIndices(preview.items)
    // Both shapes must end up with distinct, correct specIndex values.
    // The hybrid path is only meaningfully verified when both kinds get
    // placed, so the assertion requires each spec to appear (no silent
    // pass when only the trapezoids fit).
    expect(indices).toEqual([0, 1])
  })

  it("mixed-NFP path (cone+trapezoid mix) stamps original indices", () => {
    // All cone-or-trapezoid with at least one cone triggers tryMixedNfpCandidate.
    // Use non-trivial originalIndex values so re-indexing would be detectable.
    const specs = [
      cone(120, 2, 6, 2, 1, "K1"),
      trapezoid(8, 12, 6, 2, 2, "T2"),
    ]

    const preview = generateMultiPartPreview(
      ROLL_W,
      ROLL_L,
      specs,
      FALLBACK_W,
      FALLBACK_H,
      false
    )
    expect(preview.items.length).toBeGreaterThan(0)

    const indices = uniqueSpecIndices(preview.items)
    // Require each original spec to appear so the assertion can't silently
    // pass with only one kind placed; bug fix is only meaningful when both
    // shape kinds carry their non-zero original indices.
    expect(indices).toEqual([1, 2])
  })
})

describe("issue #121 — regressions: existing layouts unchanged", () => {
  it("single-spec rectangle layout still has all items at specIndex 0", () => {
    const specs = [rect(10, 6, 6, 0)]
    const preview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)

    expect(preview.items.length).toBeGreaterThan(0)
    expect(preview.items.every((it) => it.specIndex === 0)).toBe(true)
  })

  it("specs without _originalSpecIndex fall back to local position", () => {
    // Backwards compatibility: callers that haven't migrated yet still work.
    const specs: SimplePartSpec[] = [
      { partType: "rectangle", quantity: 4, width: 10, length: 5 },
      { partType: "rectangle", quantity: 4, width: 8, length: 4 },
    ]
    const preview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)

    const indices = uniqueSpecIndices(preview.items)
    expect(indices).toEqual([0, 1])
  })

  it("globalMultiSheetPack stamps original indices across overflow sheets", () => {
    // Pure rectangle mix that overflows one sheet — production routes this
    // through globalMultiSheetPack (NestingVisualizer.tsx::buildMultiSheet),
    // not computeMultiSheetPreviews. Exercises the entry point directly.
    const specs = [rect(40, 80, 1, 0, "BIG"), rect(10, 6, 16, 1, "SMALL")]

    const multi = globalMultiSheetPack(specs, ROLL_W, ROLL_L, 4, FALLBACK_W, FALLBACK_H)

    expect(multi.sheets.length).toBeGreaterThanOrEqual(1)
    for (const sheet of multi.sheets) {
      for (const item of sheet.preview.items) {
        expect(item.specIndex).not.toBeUndefined()
        expect([0, 1]).toContain(item.specIndex)
      }
    }
  })
})

describe("issue #121 — integration: tag map / legend completeness", () => {
  /** Mirrors the legend builder in nesting-viz-simple-mode.tsx:451-481.
   *  `buildTagMap` itself is imported from production so test coverage tracks
   *  runtime behavior — see CodeRabbit feedback during implementation. */
  function buildLegend(tagMap: Map<string, string>, allItems: PreviewItem[]) {
    const indexToLabel = new Map<string, string>()
    for (const item of allItems) {
      const key = String(item.specIndex ?? -1)
      if (tagMap.has(key) && !indexToLabel.has(key)) {
        indexToLabel.set(key, item.label)
      }
    }
    const legendByTag = new Map<string, { label: string; hasResolvedLabel: boolean }>()
    for (const [key, tag] of tagMap.entries()) {
      const resolvedLabel = indexToLabel.get(key)
      const existing = legendByTag.get(tag)
      if (!existing || (!existing.hasResolvedLabel && resolvedLabel)) {
        legendByTag.set(tag, {
          label: resolvedLabel ?? key,
          hasResolvedLabel: Boolean(resolvedLabel),
        })
      }
    }
    return [...legendByTag.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, { label }]) => ({ tag, label }))
  }

  it("multi-sheet mixed-shape layout produces complete legend (Done-when of issue #121)", () => {
    const specs = [
      rect(40, 60, 1, 0, "BIG"),
      rect(10, 6, 8, 1, "SMALL-A"),
      rect(8, 8, 8, 2, "SMALL-B"),
    ]

    const basePreview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)
    const regenerate = (_qty: number, remainingSpecs?: SimplePartSpec[]) =>
      generateMultiPartPreview(
        ROLL_W,
        ROLL_L,
        remainingSpecs ?? specs,
        FALLBACK_W,
        FALLBACK_H
      )
    const multi = computeMultiSheetPreviews(basePreview, ROLL_W, ROLL_L, 4, regenerate, specs)
    const allItems = multi.sheets.flatMap((s) => s.preview.items)

    const tagMap = buildTagMap(basePreview, multi)
    const legend = buildLegend(tagMap, allItems)

    // Every original spec must show up in the tag map (no shapes "lost" from legend).
    expect(tagMap.size).toBe(3)
    expect(tagMap.get("0")).toBe("BIG")
    expect(tagMap.get("1")).toBe("SMALL-A")
    expect(tagMap.get("2")).toBe("SMALL-B")

    // Every legend entry has a non-empty dimension/label.
    for (const entry of legend) {
      expect(entry.label).toBeTruthy()
      expect(entry.label).not.toMatch(/^\d+$/) // bare specIndex string would match — must NOT happen
    }
  })

  it("collapses duplicate part-number tags to one legend entry per letter (PR #137)", () => {
    // Two specs with the same partNumber → tagMap has two distinct keys
    // mapping to the same tag value. Without dedupe the legend would emit
    // two "G1" rows + a duplicate React key warning.
    const specs = [
      rect(40, 60, 1, 0, "G1"),
      rect(20, 30, 2, 1, "G1"),
      rect(8, 8, 4, 2, "G2"),
    ]
    const basePreview = generateMultiPartPreview(ROLL_W, ROLL_L, specs, FALLBACK_W, FALLBACK_H)
    const tagMap = buildTagMap(basePreview, null)
    const legend = buildLegend(tagMap, basePreview.items)

    expect(tagMap.size).toBe(3) // raw map: two keys mapping to "G1", one to "G2"
    expect(legend).toHaveLength(2) // collapsed to one per unique tag
    expect(legend.map((e) => e.tag)).toEqual(["G1", "G2"])
  })
})
