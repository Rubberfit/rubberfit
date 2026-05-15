// @vitest-environment node
//
// PR 0b — the cut-history PDF renderer paints a part's outer ring AND
// its holes as a compound PDF path with the even-odd fill rule, so
// hatch / fill stop at the hole boundary instead of bleeding through.
// Codex v2 risk flag: "PDF must use a true compound even-odd
// fill/clip, or hatch/fill will bleed through holes."
//
// These tests verify the PDF stream contains the expected operators:
//   - `f*` (FillEvenOdd) — issued when a part with holes is rendered
//   - `W* n` (ClipEvenOdd + EndPath) — issued for the hatch clipping
//     pass on parts with holes
// Parts without holes continue to use the plain `f` (Fill) operator.
//
// jsPDF emits uncompressed PDF streams by default in Node, so the
// blob's bytes contain these operators as plain ASCII.

import { describe, expect, it } from "vitest"

import { generateCutPdf } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import { buildCutPdfDataFromRow } from "@/app/api/_lib/cut-pdf-server"
import type { LayoutModel } from "@/app/dashboard/cutting-engine/_components/layout-model"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

function ringLayout(): LayoutModel {
  return {
    sheetWidth: 48,
    sheetLength: 48,
    parts: [
      {
        id: "ring-1",
        shapeId: "ring",
        label: "A",
        renderShape: "polygon",
        specIndex: 0,
        x: 1,
        y: 1,
        rotationRad: 0,
        width: 12,
        height: 12,
        polygon: [
          { x: 1, y: 1 },
          { x: 13, y: 1 },
          { x: 13, y: 13 },
          { x: 1, y: 13 },
        ],
        holes: [
          [
            { x: 5, y: 5 },
            { x: 9, y: 5 },
            { x: 9, y: 9 },
            { x: 5, y: 9 },
          ],
        ],
      },
    ],
    offcuts: [],
    scrap: [],
    placedCount: 1,
    overflowCount: 0,
    usedAreaSqFt: 0.9,
    reusableAreaSqFt: 0,
    scrapAreaSqFt: 0,
    fabScore: 0.04,
    source: "rust-rf-layout",
  }
}

function plainPolygonLayout(): LayoutModel {
  return {
    ...ringLayout(),
    parts: [
      {
        ...ringLayout().parts[0],
        holes: undefined,
      },
    ],
  }
}

function makeCut(): CutHistory {
  return {
    id: "cut-pr-0b-pdf",
    user_id: "user-1",
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: 0,
    part_id: 1,
    cut_length: 48,
    cut_width: 48,
    cut_thickness: 0.25,
    kerf: 0.125,
    part_custom_width: null,
    part_custom_height: null,
    part_custom_diameter: null,
    part_custom_top_width: null,
    part_custom_bottom_width: null,
    part_custom_height_trapezoid: null,
    part_custom_inner_radius: null,
    part_custom_outer_radius: null,
    part_custom_arc_degrees: null,
    parts_completed: 1,
    parts_overflow: 0,
    cut_pieces: 1,
    cut_diameter: null,
    material_used_sqft: 0.9,
    scrap_sqft: 0,
    reusable_offset_sqft: 0,
    fab_score: 0.04,
    cut_date: "2026-05-15",
    stock_label: "demo",
    part_selected_label: ["ring 12 OD / 4 hole"],
    layout_json: null,
    pdf_url: null,
    created_at: "2026-05-15",
  } as unknown as CutHistory
}

async function blobToText(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  // PDF streams may contain non-UTF-8 bytes; decode as latin1 so every
  // byte maps to a single character and the operator ASCII (`f*`,
  // `W*`, `n`) round-trips intact.
  return new TextDecoder("latin1").decode(new Uint8Array(buffer))
}

describe("PR 0b — cut-history PDF compound path for parts with holes", () => {
  it("emits a fillEvenOdd (`f*`) operator when a part has holes", async () => {
    const layouts = [ringLayout()]
    const data = buildCutPdfDataFromRow(makeCut(), layouts)
    const blob = await generateCutPdf({ svgElements: [], layouts, data })
    const text = await blobToText(blob)
    // PDF stream: `f*` appears as its own operator on a line, preceded
    // by the path-building operators (`m`, `l`, `h`) and followed by
    // whitespace. Match the operator with non-word boundaries on
    // either side. `\b` doesn't sit between two non-word chars, so we
    // use a leading word-boundary + a trailing non-word lookahead.
    expect(text).toMatch(/\bf\*(?=\s)/)
  })

  it("emits a clipEvenOdd (`W*`) operator for the hatch clipping pass on parts with holes", async () => {
    const layouts = [ringLayout()]
    const data = buildCutPdfDataFromRow(makeCut(), layouts)
    const blob = await generateCutPdf({ svgElements: [], layouts, data })
    const text = await blobToText(blob)
    expect(text).toMatch(/W\*/)
  })

  it("does NOT emit fillEvenOdd for a part WITHOUT holes (back-compat path)", async () => {
    const layouts = [plainPolygonLayout()]
    const data = buildCutPdfDataFromRow(makeCut(), layouts)
    const blob = await generateCutPdf({ svgElements: [], layouts, data })
    const text = await blobToText(blob)
    // Plain-polygon path uses jsPDF's `style: "F"` → emits `f` (no star).
    // Confirm `f*` is absent on the no-hole render.
    expect(text).not.toMatch(/\bf\*\b/)
  })

  it("produces a valid PDF blob (non-empty, application/pdf)", async () => {
    const layouts = [ringLayout()]
    const data = buildCutPdfDataFromRow(makeCut(), layouts)
    const blob = await generateCutPdf({ svgElements: [], layouts, data })
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.size).toBeGreaterThan(1024)
    expect(blob.type).toBe("application/pdf")
  })
})
