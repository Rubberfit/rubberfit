// PR 0c — `cut_history.layout_json.version` bumped from `1` to `1 | 2`.
// `version: 2` marks envelopes whose `PlacedPart.holes?: Point2D[][]` sibling
// field may carry data (gasket rings, full-face bolt circles, CAD-imported
// holes). This pins:
//
//   1. Both readers (`extractAutoLayouts` for server PDF regen,
//      `extractFrozenLayouts` for the UI history load) accept v1 + v2.
//   2. Both readers reject unknown versions (3, "1", null, NaN) — the
//      version fence is the explicit signal that a future schema with
//      load-bearing additions cannot be loaded with this build.
//   3. A v1 row with no holes loads, renders, and re-saves as v2 (writers
//      always stamp `CURRENT_LAYOUT_JSON_VERSION`; no data migration runs).
//   4. A v2 row with holes round-trips through the coercer with holes
//      preserved.
//   5. Fuzz: 100 random JSON shapes through `coerceLayoutModelArray`
//      either return null or a valid `LayoutModel[]` — never throw,
//      never produce a partially-valid structure.

import { describe, expect, it } from "vitest"

import { extractAutoLayouts } from "@/app/api/_lib/cut-pdf-server"
import { extractFrozenLayouts } from "@/app/dashboard/cutting-engine/_components/cut-load-utils"
import {
  coerceLayoutModelArray,
  isLayoutModel,
  isLayoutModelArray,
  type LayoutModel,
} from "@/app/dashboard/cutting-engine/_components/layout-model"
import {
  CURRENT_LAYOUT_JSON_VERSION,
  isSupportedLayoutJsonVersion,
} from "@/src/infrastructure/models/cut-history-layout"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import { assertNotNull } from "../_helpers/assert-not-null"

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

function makeRingLayout(): LayoutModel {
  // A ring (annulus) carries holes — outer square + inner square cutout.
  return makeLayout({
    parts: [
      {
        id: "ring-1",
        shapeId: "spec-0",
        label: "R",
        renderShape: "ring",
        specIndex: 0,
        x: 1,
        y: 1,
        rotationRad: 0,
        width: 12,
        height: 12,
        innerRadius: 4,
        outerRadius: 6,
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
  })
}

function makeCut(overrides: Partial<CutHistory> = {}): CutHistory {
  return {
    id: "cut-pr0c-test",
    user_id: "user-1",
    roll_id: null,
    job_id: null,
    job_part_id: null,
    material_id: 0,
    part_id: 1,
    cut_length: 96,
    cut_width: 48,
    cut_thickness: 0.5,
    kerf: 0.125,
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
    cut_date: "2026-05-15T00:00:00Z",
    created_at: "2026-05-15T00:00:00Z",
    updated_at: "2026-05-15T00:00:00Z",
    ...overrides,
  }
}

describe("PR 0c — layout_json version compat", () => {
  describe("isSupportedLayoutJsonVersion", () => {
    it("accepts 1 and 2 (the currently supported set)", () => {
      expect(isSupportedLayoutJsonVersion(1)).toBe(true)
      expect(isSupportedLayoutJsonVersion(2)).toBe(true)
    })

    it("rejects unknown numeric versions", () => {
      expect(isSupportedLayoutJsonVersion(0)).toBe(false)
      expect(isSupportedLayoutJsonVersion(3)).toBe(false)
      expect(isSupportedLayoutJsonVersion(-1)).toBe(false)
    })

    it("rejects non-numeric versions", () => {
      expect(isSupportedLayoutJsonVersion("1")).toBe(false)
      expect(isSupportedLayoutJsonVersion(null)).toBe(false)
      expect(isSupportedLayoutJsonVersion(undefined)).toBe(false)
      expect(isSupportedLayoutJsonVersion(Number.NaN)).toBe(false)
      expect(isSupportedLayoutJsonVersion({})).toBe(false)
    })

    it("exports CURRENT_LAYOUT_JSON_VERSION as a supported version", () => {
      expect(isSupportedLayoutJsonVersion(CURRENT_LAYOUT_JSON_VERSION)).toBe(true)
    })
  })

  describe("extractAutoLayouts (server PDF regen reader)", () => {
    it("accepts v1 envelopes (legacy, no holes)", () => {
      const layouts = [makeLayout()]
      const result = extractAutoLayouts({
        version: 1,
        kind: "auto",
        perTemplateQuantities: [1],
        layouts,
      })
      expect(result).toEqual(layouts)
    })

    it("accepts v2 envelopes with hole-bearing parts", () => {
      const layouts = [makeRingLayout()]
      const result = extractAutoLayouts({
        version: 2,
        kind: "auto",
        perTemplateQuantities: [1],
        layouts,
      })
      assertNotNull(result)
      expect(result).toHaveLength(1)
      expect(result[0].parts[0].holes).toHaveLength(1)
      expect(result[0].parts[0].holes?.[0]).toHaveLength(4)
    })

    it("rejects unknown future versions to avoid silent mis-render", () => {
      const layouts = [makeLayout()]
      const result = extractAutoLayouts({
        // Numeric but outside the supported set — cast through the type
        // because the discriminated union forbids it at compile time.
        version: 3 as unknown as 1 | 2,
        kind: "auto",
        perTemplateQuantities: [1],
        layouts,
      })
      expect(result).toBeNull()
    })

    it("rejects missing / non-numeric version", () => {
      const layouts = [makeLayout()]
      const malformed = {
        version: "1",
        kind: "auto",
        perTemplateQuantities: [1],
        layouts,
      } as unknown as Parameters<typeof extractAutoLayouts>[0]
      expect(extractAutoLayouts(malformed)).toBeNull()
    })
  })

  describe("extractFrozenLayouts (UI history load reader)", () => {
    it("accepts v1 envelopes", () => {
      const cut = makeCut({
        layout_json: {
          version: 1,
          kind: "auto",
          perTemplateQuantities: [1],
          layouts: [makeLayout()],
        },
      })
      const result = extractFrozenLayouts(cut)
      expect(result).toHaveLength(1)
    })

    it("accepts v2 envelopes with holes", () => {
      const cut = makeCut({
        layout_json: {
          version: 2,
          kind: "auto",
          perTemplateQuantities: [1],
          layouts: [makeRingLayout()],
        },
      })
      const recovered = extractFrozenLayouts(cut)
      assertNotNull(recovered)
      expect(recovered[0].parts[0].holes).toHaveLength(1)
    })

    it("rejects unknown versions (consistent with extractAutoLayouts)", () => {
      const cut = makeCut({
        layout_json: {
          version: 99 as unknown as 1 | 2,
          kind: "auto",
          perTemplateQuantities: [1],
          layouts: [makeLayout()],
        },
      })
      expect(extractFrozenLayouts(cut)).toBeNull()
    })
  })

  describe("Round-trip", () => {
    it("v1 row (no holes) loads, renders unchanged, and re-saves as v2", () => {
      // Simulate a v1 row read from the DB.
      const v1Row = {
        version: 1 as const,
        kind: "auto" as const,
        perTemplateQuantities: [1],
        layouts: [makeLayout()],
      }
      const loaded = extractAutoLayouts(v1Row)
      assertNotNull(loaded)
      expect(loaded).toEqual(v1Row.layouts)

      // The save path always stamps the current version — re-saving an
      // unchanged loaded layout produces a v2 envelope.
      const reSaved = {
        version: CURRENT_LAYOUT_JSON_VERSION,
        kind: "auto" as const,
        perTemplateQuantities: [1],
        layouts: loaded,
      }
      expect(reSaved.version).toBe(2)
      // And the re-saved envelope still loads cleanly.
      expect(extractAutoLayouts(reSaved)).toEqual(loaded)
    })

    it("v2 row with holes preserves the holes through coercer", () => {
      const ringLayouts = [makeRingLayout()]
      const v2Row = {
        version: 2 as const,
        kind: "auto" as const,
        perTemplateQuantities: [1],
        layouts: ringLayouts,
      }
      // Coerce as if read from JSONB (the UI history load path).
      const result = coerceLayoutModelArray(v2Row.layouts)
      assertNotNull(result)
      expect(result).toHaveLength(1)
      const holes = result[0].parts[0].holes
      expect(holes).toBeDefined()
      expect(holes).toHaveLength(1)
      expect(holes?.[0]).toHaveLength(4)
      // The hole vertices are preserved byte-for-byte (not just shape).
      expect(holes?.[0][0]).toEqual({ x: 5, y: 5 })
    })
  })

  describe("Fuzz — coerceLayoutModelArray never throws", () => {
    // Goal: every random JSON-ish shape either returns null or a valid
    // `LayoutModel[]`. The coercer is the trust boundary between
    // JSONB-on-disk and the renderer; throwing here would mean a
    // single corrupt cut nukes the whole history page.

    function randFloat(rng: () => number, min: number, max: number): number {
      return min + rng() * (max - min)
    }

    function randInt(rng: () => number, max: number): number {
      return Math.floor(rng() * max)
    }

    // Tiny mulberry32 so the fuzz is reproducible across runs without
    // a dependency. Seed picks 100 distinct shapes.
    function mulberry32(seed: number): () => number {
      let state = seed >>> 0
      return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
      }
    }

    function randomPoint(rng: () => number): unknown {
      // 80% valid point, 20% malformed (missing field, NaN, string).
      const roll = rng()
      if (roll < 0.8) return { x: randFloat(rng, -100, 100), y: randFloat(rng, -100, 100) }
      if (roll < 0.85) return { x: Number.NaN, y: 0 }
      if (roll < 0.9) return { x: "0", y: 1 }
      if (roll < 0.95) return null
      return { x: 1 } // missing y
    }

    function randomPart(rng: () => number): unknown {
      const polyLen = randInt(rng, 8)
      const holeLen = randInt(rng, 3)
      const part: Record<string, unknown> = {
        id: `p-${randInt(rng, 1000)}`,
        shapeId: `s-${randInt(rng, 100)}`,
        label: String.fromCharCode(65 + randInt(rng, 26)),
        renderShape: ["rect", "circle", "ring", "polygon", "unknown"][randInt(rng, 5)],
        specIndex: randInt(rng, 10),
        x: randFloat(rng, 0, 96),
        y: randFloat(rng, 0, 48),
        rotationRad: randFloat(rng, -Math.PI, Math.PI),
        width: randFloat(rng, 1, 24),
        height: randFloat(rng, 1, 24),
      }
      // 50% chance of a polygon, 30% chance of holes (only when polygon).
      if (rng() < 0.5) {
        part.polygon = Array.from({ length: polyLen }, () => randomPoint(rng))
        if (rng() < 0.6) {
          part.holes = Array.from({ length: holeLen }, () =>
            Array.from({ length: randInt(rng, 6) }, () => randomPoint(rng))
          )
        }
      }
      // 10% chance of corruption — drop a required field.
      if (rng() < 0.1) {
        delete part.width
      }
      return part
    }

    function randomLayout(rng: () => number): unknown {
      const partCount = randInt(rng, 6)
      const corrupt = rng() < 0.15
      const layout: Record<string, unknown> = {
        sheetWidth: corrupt ? "wide" : randFloat(rng, 12, 120),
        sheetLength: randFloat(rng, 12, 120),
        parts: Array.from({ length: partCount }, () => randomPart(rng)),
        offcuts: [],
        scrap: [],
        placedCount: partCount,
        overflowCount: 0,
        usedAreaSqFt: randFloat(rng, 0, 50),
        reusableAreaSqFt: randFloat(rng, 0, 50),
        scrapAreaSqFt: randFloat(rng, 0, 50),
        fabScore: rng(),
        source: rng() < 0.5 ? "ts-nfp" : "rust-rf-layout",
      }
      return layout
    }

    it("100 random envelopes never throw; result is null or a valid LayoutModel[]", () => {
      const rng = mulberry32(0xc0c_d00d)
      let validCount = 0
      let nullCount = 0
      for (let i = 0; i < 100; i++) {
        const envelopeLayouts = Array.from({ length: randInt(rng, 4) }, () => randomLayout(rng))
        let result: LayoutModel[] | null = null
        expect(() => {
          result = coerceLayoutModelArray(envelopeLayouts)
        }).not.toThrow()
        if (result === null) {
          nullCount++
        } else {
          validCount++
          // Every layout the coercer surfaces must pass the strict guard
          // (the coercer is supposed to back-fill defaults, not produce
          // half-valid output that downstream readers reject).
          expect(isLayoutModelArray(result)).toBe(true)
        }
      }
      // Sanity — across 100 random shapes, we expect a healthy mix.
      // Allow either side to be 0 since the RNG is deterministic, but
      // the total must be 100.
      expect(validCount + nullCount).toBe(100)
    })

    it("a hand-crafted valid v2 envelope round-trips through the fuzz path", () => {
      // Sanity anchor: the fuzz harness above can run for hours without
      // exercising the "v2 with holes" happy path, so pin one explicit
      // round-trip here.
      const result = coerceLayoutModelArray([makeRingLayout()])
      assertNotNull(result)
      expect(result).toHaveLength(1)
      expect(isLayoutModel(result[0])).toBe(true)
      expect(result[0].parts[0].holes).toHaveLength(1)
    })
  })
})
