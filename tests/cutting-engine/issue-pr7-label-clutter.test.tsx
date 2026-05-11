/**
 * Phase 5 PR 7 — label-clutter threshold for the auto-nest SVG renderer.
 *
 * Pins the rules Codex specified during the pre-implementation review:
 *
 *   1. Hide a tag letter when the on-screen pixel size (fontSize * zoom)
 *      would render below 9px. Don't threshold raw fontSize — the
 *      viewBox shrinks with zoom, so the formula divides by zoom to
 *      keep absolute screen size stable.
 *   2. When zoom <= 1.5 AND the sheet carries more than 20 parts,
 *      suppress every tag regardless of individual size. Overlapping
 *      letters become noise at that density.
 *   3. aria-label on the `<g>` still carries the tag for screen readers
 *      even when the visual label is suppressed (PR 4 wired the label).
 */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import NestingShapeRenderer from "@/app/dashboard/cutting-engine/_components/nesting-shape-renderer"
import type { PreviewItem } from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

function renderRect(opts: {
  itemWidth: number
  itemHeight: number
  scale: number
  zoom: number
  totalPartsOnSheet?: number
}): string {
  const item: PreviewItem = {
    x: 0,
    y: 0,
    width: opts.itemWidth,
    height: opts.itemHeight,
    renderShape: "rect",
    label: "A",
  }
  return renderToStaticMarkup(
    <svg>
      <NestingShapeRenderer
        item={item}
        index={0}
        surfaceX={0}
        surfaceY={0}
        unitOriginX={0}
        unitOriginY={0}
        scale={opts.scale}
        tagLetter="A"
        zoom={opts.zoom}
        totalPartsOnSheet={opts.totalPartsOnSheet ?? 1}
      />
    </svg>
  )
}

describe("PR 7 — label clutter threshold", () => {
  it("renders the label when the part is comfortably large at zoom=1", () => {
    // 20 x 20 inch part at scale 10 → 200 x 200 px. fontSize formula
    // gives min(14, 200*0.3, 200*0.3) = 14. screenLabelPx = 14 * 1 = 14.
    // Above the 9px floor → label renders.
    const html = renderRect({ itemWidth: 20, itemHeight: 20, scale: 10, zoom: 1 })
    expect(html).toContain(">A</text>")
  })

  it("hides the label when screenLabelPx falls below 9", () => {
    // 4 x 4 inch part at scale 10 → 40 x 40 px. fontSize formula gives
    // min(14, 40*0.3, 40*0.3) = 12. At zoom=0.6: screenLabelPx = 12*0.6
    // = 7.2. Below floor → label hidden.
    // Note: zoom < 1 isn't typical but verifies the screenLabelPx
    // formula correctly multiplies by zoom (not divides).
    const html = renderRect({ itemWidth: 4, itemHeight: 4, scale: 10, zoom: 0.6 })
    expect(html).not.toContain(">A</text>")
  })

  it("hides the label when the part itself is too small (cap takes over)", () => {
    // 2 x 2 inch part at scale 10 → 20 x 20 px. fontSize = min(14, 6, 6)
    // = 6px. screenLabelPx = 6 * 1 = 6, below 9 → hidden.
    const html = renderRect({ itemWidth: 2, itemHeight: 2, scale: 10, zoom: 1 })
    expect(html).not.toContain(">A</text>")
  })

  it("KEEPS labels at high zoom even when raw fontSize is tiny", () => {
    // 50 x 50 inch at scale 10 = 500x500 px. At zoom=8:
    //   fontSize = min(14/8, 500*0.3, 500*0.3) = min(1.75, 150, 150) = 1.75
    // Raw fontSize 1.75 looks below threshold, but
    //   screenLabelPx = 1.75 * 8 = 14
    // which is above the 9px floor — so it MUST render.
    // This is the regression Codex flagged: raw-fontSize threshold
    // would hide normal labels at high zoom.
    const html = renderRect({ itemWidth: 50, itemHeight: 50, scale: 10, zoom: 8 })
    expect(html).toContain(">A</text>")
  })

  it("suppresses all labels when zoom <= 1.5 AND > 20 parts on the sheet", () => {
    // Even a 20 x 20 inch part at zoom=1 (which would render normally)
    // gets suppressed because the dense-sheet rule kicks in.
    const html = renderRect({
      itemWidth: 20,
      itemHeight: 20,
      scale: 10,
      zoom: 1,
      totalPartsOnSheet: 25,
    })
    expect(html).not.toContain(">A</text>")
  })

  it("ALLOWS labels at dense sheets when zoomed in past 1.5", () => {
    // Same dense sheet (25 parts), but zoom=2 means the operator has
    // pulled in to inspect a region. Labels return.
    const html = renderRect({
      itemWidth: 20,
      itemHeight: 20,
      scale: 10,
      zoom: 2,
      totalPartsOnSheet: 25,
    })
    expect(html).toContain(">A</text>")
  })
})
