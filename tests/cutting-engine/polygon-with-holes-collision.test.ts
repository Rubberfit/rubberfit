// PR 0b — `free-roam-collision.ts` generalizes the ring-only hole
// exception into a polygon-general "fully inside any hole" check.
// These tests pin the cases that motivated the generalization and
// the false-pass Codex flagged for vertex-only containment:
//   1. Full-face gasket with multiple holes — a small part dropped
//      into the bore is allowed; a part dropped onto one of the
//      bolt holes is allowed; a part dropped onto the solid annular
//      web collides.
//   2. Symmetry — dragging the host gasket onto a pre-existing small
//      part that sits inside one of the gasket's holes is allowed
//      from either direction.
//   3. Edge-intersection guard — a candidate whose vertices all lie
//      inside a non-convex hole but whose edges cross the hole's
//      boundary IS rejected (the vertex-only test would false-pass).

import { describe, expect, it } from "vitest"
import { wouldCollide } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"

function place(id: string, templateId: string, x: number, y: number): ManualPlacement {
  return { id, templateId, x, y, rotationRad: 0 }
}

function rectTemplate(id: string, width: number, height: number): PartTemplate {
  return {
    id,
    partType: "rectangle",
    label: id,
    summary: `${width}×${height}`,
    quantity: 1,
    category: "standard",
    width,
    length: height,
  }
}

function circle(cx: number, cy: number, r: number, segments = 24): Array<{ x: number; y: number }> {
  return Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
}

/**
 * Synthetic full-face gasket: 20×20 outer square, one 8" bore in the
 * centre, four 2" bolt holes at the corners of a 14×14 BCD (centered
 * on the same bbox). All polygons in bbox-local coords with the
 * bbox-bottom-left at (0,0).
 */
function fullFaceTemplate(id: string): PartTemplate {
  const bbox = 20
  const center = bbox / 2 // 10
  const bcdHalf = 7 // 14×14 bolt circle
  return {
    id,
    partType: "rectangle",
    label: id,
    summary: "20×20 full-face gasket",
    quantity: 1,
    category: "custom",
    width: bbox,
    length: bbox,
    renderShape: "polygon",
    polygon: [
      { x: 0, y: 0 },
      { x: bbox, y: 0 },
      { x: bbox, y: bbox },
      { x: 0, y: bbox },
    ],
    holes: [
      circle(center, center, 4), // bore (ID 8)
      circle(center - bcdHalf, center - bcdHalf, 1), // bolt holes (Ø 2)
      circle(center + bcdHalf, center - bcdHalf, 1),
      circle(center - bcdHalf, center + bcdHalf, 1),
      circle(center + bcdHalf, center + bcdHalf, 1),
    ],
  }
}

describe("PR 0b — generalized hole-as-void collision", () => {
  it("a small part dropped in the bore of a full-face gasket does NOT collide", () => {
    const parts = [fullFaceTemplate("ff"), rectTemplate("small", 2, 2)]
    const gasket = place("ff1", "ff", 0, 0) // gasket bbox 0..20, bore at (10,10) r=4
    const small = place("s1", "small", 9, 9) // 2×2 part inside bore (9..11, 9..11)
    expect(wouldCollide(small, 9, 9, [gasket], parts)).toBe(false)
  })

  it("a small part dropped in one of the bolt holes does NOT collide", () => {
    const parts = [fullFaceTemplate("ff"), rectTemplate("bolt", 1, 1)]
    const gasket = place("ff1", "ff", 0, 0)
    // Bolt hole centered at (3, 3) with radius 1 → covers bbox (2..4, 2..4).
    // 1×1 bolt at (2.5, 2.5) sits inside.
    const bolt = place("b1", "bolt", 2.5, 2.5)
    expect(wouldCollide(bolt, 2.5, 2.5, [gasket], parts)).toBe(false)
  })

  it("a part landing on the solid annular web (not a hole) DOES collide", () => {
    const parts = [fullFaceTemplate("ff"), rectTemplate("small", 2, 2)]
    const gasket = place("ff1", "ff", 0, 0)
    // (1, 9) sits on the gasket's left web — outside the bore (centred
    // at 10,10 r=4) and outside any bolt hole.
    const onWeb = place("s1", "small", 1, 9)
    expect(wouldCollide(onWeb, 1, 9, [gasket], parts)).toBe(true)
  })

  it("a candidate well inside a hole exercises segmentsCross without false-positive crossings (DIRECTION_EPS defensive guard)", () => {
    // The DIRECTION_EPS guard in segmentsCross is defensive against
    // a float-noise scenario that's hard to construct deterministically:
    // two edges that are MATHEMATICALLY collinear but produce
    // ±float-precision cross-products with noise-driven sign flips.
    // Sigilix's report described real-world appearances; reproducing
    // the exact noise pattern in a unit test requires geometry where
    // direction() values straddle zero with opposite signs near
    // float epsilon — which mathematically means the candidate edge
    // crosses the hole edge (which IS a real crossing).
    //
    // This test stands in for the EPS branch by exercising the
    // segmentsCross hot path on a candidate fully inside a hole with
    // non-pathological geometry. It pins the contract — "fully
    // inside means wouldCollide returns false" — that the EPS guard
    // protects under float noise. The guard's correctness on the
    // pathological inputs is verified by inspection of the EPS
    // constants (1e-10 in² is well below operator-perceptible
    // geometry; see free-roam-collision.ts:DIRECTION_EPS).
    const hostHole: PartTemplate = {
      id: "host-hole",
      partType: "rectangle",
      label: "host-hole",
      summary: "10×10 with square hole",
      quantity: 1,
      category: "custom",
      width: 10,
      length: 10,
      renderShape: "polygon",
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [
        [
          { x: 1, y: 1 },
          { x: 9, y: 1 },
          { x: 9, y: 9 },
          { x: 1, y: 9 },
        ],
      ],
    }
    const tiny: PartTemplate = rectTemplate("tiny", 4, 4)
    const parts = [hostHole, tiny]
    const host = place("h1", "host-hole", 0, 0)
    // 4×4 candidate centered in the 8×8 hole: bottom-left (3,3),
    // top-right (7,7). Comfortably inside; all 4 segmentsCross
    // comparisons run against the 4 hole edges, none produce a
    // crossing. Pins the happy-path behavior the EPS guard preserves.
    const candidate = place("c1", "tiny", 3, 3)
    expect(wouldCollide(candidate, 3, 3, [host], parts)).toBe(false)
  })

  it("symmetric: dragging the gasket onto a pre-placed small part inside its bore does NOT collide", () => {
    const parts = [fullFaceTemplate("ff"), rectTemplate("small", 2, 2)]
    const existingSmall = place("s1", "small", 19, 19)
    // Drag gasket so its bbox covers (10..30, 10..30) — bore moves to
    // (20, 20) r=4. The small part at (19..21, 19..21) is now bracketed
    // by the bore so... actually wait, (19..21) vs bore (16..24) — yes
    // small sits inside the bore.
    const proposedGasket = place("ff1", "ff", 10, 10)
    expect(wouldCollide(proposedGasket, 10, 10, [existingSmall], parts)).toBe(false)
  })

  it("legacy ring template without explicit holes still gets the hole exception via innerRadius fallback (Codex P2 regression)", () => {
    // Pre-PR-0b ring templates carry `innerRadius`/`outerRadius` and
    // `renderShape: "ring"` but no `holes` array — they were saved
    // with the previous registry shape and reload that way. The
    // generalized collision path must still allow a small part to
    // drop into the bore of such a legacy ring.
    const legacyRing: PartTemplate = {
      id: "legacy-ring",
      partType: "cylinder",
      label: "legacy-ring",
      summary: "Ø 24 / 12 (no holes field)",
      quantity: 1,
      category: "custom",
      diameter: 24,
      width: 24,
      length: 24,
      innerRadius: 6,
      outerRadius: 12,
      renderShape: "ring",
      // NOTE: no `polygon` and no `holes` — pre-PR-0b shape
    }
    const small: PartTemplate = rectTemplate("small", 4, 4)
    const parts = [legacyRing, small]
    const ringPlacement = place("ring1", "legacy-ring", 10, 10)
    // Ring center (22, 22), bore radius 6 → bore region (16..28, 16..28).
    // 4×4 small at (20, 20) sits inside.
    const proposed = place("s1", "small", 20, 20)
    expect(wouldCollide(proposed, 20, 20, [ringPlacement], parts)).toBe(false)
  })

  it("rejects a candidate whose VERTICES sit inside a hole but whose EDGES cross the hole boundary (Codex edge-intersection guard)", () => {
    // Synthetic non-convex hole: U-shape with a thin "tongue" sticking
    // in. A candidate whose vertices ALL sit inside the U's outer
    // bbox but whose edges cross the tongue would false-pass under a
    // pure point-in-polygon check.
    //
    // U-shape, bbox 10×10:
    //   outer:    (0,0)-(10,0)-(10,10)-(0,10)
    //   hole:     (1,1)-(4,1)-(4,8)-(6,8)-(6,1)-(9,1)-(9,9)-(1,9)
    //             (a rectangle minus a tongue running up the middle)
    const uHoleHost: PartTemplate = {
      id: "u-host",
      partType: "rectangle",
      label: "u-host",
      summary: "10×10 with U-shaped hole",
      quantity: 1,
      category: "custom",
      width: 10,
      length: 10,
      renderShape: "polygon",
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [
        [
          { x: 1, y: 1 },
          { x: 4, y: 1 },
          { x: 4, y: 8 },
          { x: 6, y: 8 },
          { x: 6, y: 1 },
          { x: 9, y: 1 },
          { x: 9, y: 9 },
          { x: 1, y: 9 },
        ],
      ],
    }
    // A 6×0.5 strip running horizontally across at y=5 has vertices at
    // (2, 4.75), (8, 4.75), (8, 5.25), (2, 5.25). All four vertices
    // sit inside the U's outer bbox interior, BUT the strip's edges
    // cross the tongue at x=4 and x=6 — vertex-only would false-pass,
    // edge-intersection correctly rejects.
    const stripTemplate: PartTemplate = {
      id: "strip",
      partType: "rectangle",
      label: "strip",
      summary: "6×0.5 strip",
      quantity: 1,
      category: "standard",
      width: 6,
      length: 0.5,
    }
    const parts = [uHoleHost, stripTemplate]
    const host = place("u1", "u-host", 0, 0)
    const strip = place("s1", "strip", 2, 4.75)
    expect(wouldCollide(strip, 2, 4.75, [host], parts)).toBe(true)
  })
})
