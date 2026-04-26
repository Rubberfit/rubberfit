// @vitest-environment node
//
// Force Node environment so the jsPDF smoke test (J) actually exercises
// the runtime the API route runs under. happy-dom would mask the bug
// where jsPDF / its embedded JPEG decoder reaches for DOM globals.
//
// Issue #127 regression: the PDF view button intermittently disappeared
// for saved cuts. Root cause was an unconditional `cut.pdf_url && (...)`
// gate combined with a fire-and-forget client-side PDF upload that
// silently fails (browser navigation, network blip, storage rejection).
//
// The fix introduces server-side regeneration: the table renders the
// button whenever the row carries a `pdf_url` OR a recoverable layout
// snapshot (auto-nest rows since #126), and a `POST /api/cuts/history/[id]/pdf`
// route regenerates from `layout_json` on demand.
//
// These tests cover:
//   A. canViewPdf — true when pdf_url is set
//   B. canViewPdf — true when auto layout snapshot is recoverable
//   C. canViewPdf — false when layout_json is missing (legacy row)
//   D. canViewPdf — false for manual rows (no auto layouts to render)
//   E. extractAutoLayouts — pulls valid LayoutModel[] from layout_json
//   F. extractAutoLayouts — rejects malformed `layouts` field
//   G. extractAutoLayouts — null for manual layouts (no auto snapshot)
//   H. buildCutPdfDataFromRow — rolls cut row + layouts into PDF data
//   I. buildCutPdfDataFromRow — derives tag map from PlacedPart labels

import { describe, expect, it } from "vitest"

import { canViewPdf } from "@/app/dashboard/history/_components/use-cut-history"
import { generateCutPdf } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import {
  buildCutPdfDataFromRow,
  extractAutoLayouts,
} from "@/app/api/_lib/cut-pdf-server"
import type { LayoutModel } from "@/app/dashboard/cutting-engine/_components/layout-model"
import type { CutHistory } from "@/src/infrastructure/models/supabase"

function makeLayout(overrides: Partial<LayoutModel> = {}): LayoutModel {
  return {
    sheetWidth: 96,
    sheetLength: 48,
    parts: [
      {
        id: "part-1",
        shapeId: "spec-0",
        label: "A",
        renderShape: "rect",
        specIndex: 0,
        x: 0,
        y: 0,
        rotationRad: 0,
        width: 24,
        height: 12,
      },
    ],
    offcuts: [{ x: 24, y: 0, width: 72, height: 48 }],
    scrap: [],
    placedCount: 1,
    overflowCount: 0,
    usedAreaSqFt: 2,
    reusableAreaSqFt: 24,
    scrapAreaSqFt: 0,
    fabScore: 0.88,
    source: "ts-nfp",
    ...overrides,
  }
}

function makeCut(overrides: Partial<CutHistory> = {}): CutHistory {
  return {
    id: "cut-127-test",
    user_id: "user-1",
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: 0,
    part_id: 1,
    cut_length: 96,
    cut_width: 48,
    cut_thickness: 0.5,
    part_custom_width: null,
    part_custom_height: null,
    part_selected_size: null,
    part_selected_size_text: null,
    part_selected_label: null,
    part_custom_dimensions: null,
    cut_amount: 1,
    parts_completed: 1,
    material_used_sqft: 2,
    reusable_offset_sqft: 24,
    scrap_sqft: 0,
    fab_score: 0.88,
    cut_pieces: 1,
    stock_label: '48" × 96"',
    cost_per_sqft: null,
    pdf_url: null,
    source: "auto",
    layout_json: null,
    cut_date: "2026-04-25T00:00:00Z",
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  }
}

describe("issue #127 — PDF button always renders for saved cuts", () => {
  describe("canViewPdf", () => {
    it("A. returns true when pdf_url is present", () => {
      const cut = makeCut({ pdf_url: "https://cdn/cuts/abc.pdf" })
      expect(canViewPdf(cut)).toBe(true)
    })

    it("B. returns true when auto layout snapshot is recoverable", () => {
      const cut = makeCut({
        layout_json: {
          version: 1,
          kind: "auto",
          perTemplateQuantities: [1],
          layouts: [makeLayout()],
        },
      })
      expect(canViewPdf(cut)).toBe(true)
    })

    it("C. returns false for legacy rows without layout_json or pdf_url", () => {
      const cut = makeCut({ layout_json: null, pdf_url: null })
      expect(canViewPdf(cut)).toBe(false)
    })

    it("D. returns false for manual layouts (no auto snapshot to render)", () => {
      const cut = makeCut({
        source: "manual",
        layout_json: {
          version: 1,
          kind: "manual",
          placements: [],
          parts: [],
          stock: { width: 48, length: 96, thickness: 0.5 },
        },
      })
      expect(canViewPdf(cut)).toBe(false)
    })
  })

  describe("extractAutoLayouts", () => {
    it("E. returns the LayoutModel[] when layout_json.layouts is valid", () => {
      const layouts = [makeLayout()]
      const result = extractAutoLayouts({
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1],
        layouts,
      })
      expect(result).toEqual(layouts)
    })

    it("F. returns null when layouts is malformed", () => {
      const result = extractAutoLayouts({
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1],
        layouts: [{ not: "a layout" } as unknown],
      })
      expect(result).toBeNull()
    })

    it("G. returns null for manual layouts (no auto snapshot)", () => {
      const result = extractAutoLayouts({
        version: 1,
        kind: "manual",
        placements: [],
        parts: [],
        stock: { width: 48, length: 96, thickness: 0.5 },
      })
      expect(result).toBeNull()
    })

    it("E2. returns null when layout_json itself is null", () => {
      expect(extractAutoLayouts(null)).toBeNull()
    })

    it("E3. returns null when auto layout omits the layouts field", () => {
      const result = extractAutoLayouts({
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1],
      })
      expect(result).toBeNull()
    })
  })

  describe("buildCutPdfDataFromRow", () => {
    it("H. mirrors row metrics into the PDF payload + computes percentages", () => {
      const layouts = [makeLayout(), makeLayout()] // 2 rolls
      const cut = makeCut({
        cut_width: 48,
        cut_length: 96,
        cut_thickness: 0.5,
        material_used_sqft: 32,
        reusable_offset_sqft: 16,
        scrap_sqft: 16,
        fab_score: 0.91,
        cut_pieces: 4,
        parts_completed: 4,
        stock_label: "EPDM 60mil",
      })

      const data = buildCutPdfDataFromRow(cut, layouts)

      expect(data.cutId).toBe(cut.id)
      expect(data.stockWidth).toBe(48)
      expect(data.stockLength).toBe(96)
      expect(data.materialName).toBe("EPDM 60mil")
      expect(data.rollCount).toBe(2)
      expect(data.materialUsedSqFt).toBe(32)
      expect(data.reusableOffcutSqFt).toBe(16)
      expect(data.scrapSqFt).toBe(16)
      // total stock = (48*96)/144 * 2 = 64 sqft → reusable% = 25, scrap% = 25
      expect(data.reusableOffcutPct).toBeCloseTo(25, 6)
      expect(data.scrapPct).toBeCloseTo(25, 6)
      expect(data.fabScore).toBe(0.91)
    })

    it("I. derives tagMap from PlacedPart labels using part_selected_label per specIndex", () => {
      const layouts = [
        makeLayout({
          parts: [
            {
              id: "p1",
              shapeId: "spec-0",
              label: "A",
              renderShape: "rect",
              specIndex: 0,
              x: 0,
              y: 0,
              rotationRad: 0,
              width: 12,
              height: 24,
            },
            {
              id: "p2",
              shapeId: "spec-1",
              label: "B",
              renderShape: "rect",
              specIndex: 1,
              x: 0,
              y: 24,
              rotationRad: 0,
              width: 24,
              height: 12,
            },
          ],
        }),
      ]
      const cut = makeCut({ part_selected_label: ['12" × 24"', '24" × 12"'] })

      const data = buildCutPdfDataFromRow(cut, layouts)

      expect(data.tagMap.get("A")).toBe('12" × 24"')
      expect(data.tagMap.get("B")).toBe('24" × 12"')
    })

    it("I2. falls back to the tag letter when part_selected_label is shorter than specIndex", () => {
      const layouts = [
        makeLayout({
          parts: [
            {
              id: "p1",
              shapeId: "spec-0",
              label: "A",
              renderShape: "rect",
              specIndex: 0,
              x: 0,
              y: 0,
              rotationRad: 0,
              width: 12,
              height: 24,
            },
            {
              id: "p2",
              shapeId: "spec-2",
              label: "C",
              renderShape: "rect",
              specIndex: 2,
              x: 0,
              y: 24,
              rotationRad: 0,
              width: 24,
              height: 12,
            },
          ],
        }),
      ]
      const cut = makeCut({ part_selected_label: ['12" × 24"'] })

      const data = buildCutPdfDataFromRow(cut, layouts)

      expect(data.tagMap.get("A")).toBe('12" × 24"')
      expect(data.tagMap.get("C")).toBe("C") // index 2 missing → fall back to label letter
    })

    // Critical smoke test: the recovery API route must be able to call
    // jsPDF in the Node runtime without DOM globals. If jsPDF's vector
    // path or the embedded JPEG logo demands `document` / `Image`, this
    // test fails at runtime — exactly where the route would fail in
    // production.
    it("J. generateCutPdf produces a non-empty PDF Blob on the Node runtime", async () => {
      const layouts = [makeLayout()]
      const cut = makeCut({ part_selected_label: ['24" × 12"'] })
      const data = buildCutPdfDataFromRow(cut, layouts)

      const blob = await generateCutPdf({ svgElements: [], layouts, data })

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(1024) // a real PDF is at least ~1KB
      expect(blob.type).toBe("application/pdf")
    })

    it("H2. reusable/scrap percentages are 0 on a degenerate stock area", () => {
      const layouts = [makeLayout({ sheetWidth: 0, sheetLength: 0 })]
      const cut = makeCut({ cut_width: 0, cut_length: 0 })

      const data = buildCutPdfDataFromRow(cut, layouts)

      expect(data.reusableOffcutPct).toBe(0)
      expect(data.scrapPct).toBe(0)
    })

    // Long-roll segmentation regression: a 600"×12" frozen layout (post-rotation
    // sheetWidth=600, sheetLength=12) used to render as a single 180×3.6mm strip
    // — too flat to read. The renderer now slices it into stacked panels at a
    // fixed height. We can't introspect the resulting PDF easily, but a smoke
    // test confirms the segmentation path (clip(), translate, multi-segment
    // header) doesn't blow up jsPDF in the Node runtime.
    it("K. generateCutPdf renders a long roll without throwing", async () => {
      const longLayout = makeLayout({
        sheetWidth: 600,
        sheetLength: 12,
        parts: Array.from({ length: 20 }, (_, i) => ({
          id: `p${i}`,
          shapeId: `spec-${i % 3}`,
          label: `${String.fromCharCode(65 + (i % 3))}${i}`,
          renderShape: "rect" as const,
          specIndex: i % 3,
          x: i * 30,
          y: 0,
          rotationRad: 0,
          width: 28,
          height: 10,
        })),
        offcuts: [{ x: 0, y: 10, width: 600, height: 2 }],
      })
      const cut = makeCut({
        cut_width: 12,
        cut_length: 600,
        material_used_sqft: 38,
        reusable_offset_sqft: 8,
        scrap_sqft: 4,
        cut_pieces: 20,
        parts_completed: 20,
      })
      const data = buildCutPdfDataFromRow(cut, [longLayout])

      const blob = await generateCutPdf({ svgElements: [], layouts: [longLayout], data })

      expect(blob).toBeInstanceOf(Blob)
      // Multiple segments + many parts → output meaningfully larger than the
      // single-strip baseline (~6KB for the K layout vs ~3KB for a tiny one).
      expect(blob.size).toBeGreaterThan(4096)
    })

    it("L. multi-roll output with one long + one normal roll renders without throwing", async () => {
      const longLayout = makeLayout({
        sheetWidth: 240,
        sheetLength: 12,
        parts: [
          {
            id: "p-long",
            shapeId: "spec-0",
            label: "A",
            renderShape: "rect",
            specIndex: 0,
            x: 0,
            y: 0,
            rotationRad: 0,
            width: 200,
            height: 10,
          },
        ],
      })
      const normalLayout = makeLayout()
      const cut = makeCut()
      const data = buildCutPdfDataFromRow(cut, [longLayout, normalLayout])

      const blob = await generateCutPdf({
        svgElements: [],
        layouts: [longLayout, normalLayout],
        data,
      })

      expect(blob).toBeInstanceOf(Blob)
      expect(blob.size).toBeGreaterThan(1024)
    })
  })
})
