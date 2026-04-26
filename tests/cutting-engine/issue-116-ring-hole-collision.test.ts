/**
 * Regression tests for the ring-hole collision exception (issue #116).
 *
 * Rings are stored with the OUTER polygon only — the registry comment
 * in `shape-registry.ts` says collision treats a hit inside the inner
 * hole as overlapping the part. That made it impossible to drop a
 * smaller part inside a ring's hole even though physically the hole is
 * empty space.
 *
 * The fix in `free-roam-collision.ts` adds an exception: when SAT
 * reports overlap with a ring placement but every vertex of the
 * candidate polygon lies inside the ring's `innerRadius`, the
 * placement is accepted (the candidate fits in the hole, not the
 * ring's body).
 */
import { describe, expect, it } from "vitest"
import { wouldCollide } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import { circleToPolygon } from "@/nesting/shape-to-polygon"

function ringTemplate(id: string, outerDiameter: number, innerDiameter: number): PartTemplate {
  // Mirrors the shape registry's ring builder.
  return {
    id,
    partType: "cylinder",
    label: id,
    summary: `⌀ ${outerDiameter}" / ${innerDiameter}"`,
    quantity: 1,
    category: "custom",
    diameter: outerDiameter,
    width: outerDiameter,
    length: outerDiameter,
    innerRadius: innerDiameter / 2,
    outerRadius: outerDiameter / 2,
    renderShape: "ring",
    polygon: circleToPolygon(outerDiameter, 48),
  }
}

function discTemplate(id: string, diameter: number): PartTemplate {
  return {
    id,
    partType: "cylinder",
    label: id,
    summary: `Ø${diameter}"`,
    quantity: 1,
    category: "standard",
    diameter,
  }
}

function place(id: string, templateId: string, x: number, y: number): ManualPlacement {
  return { id, templateId, x, y, rotationRad: 0 }
}

describe("issue #116 — ring-hole collision exception", () => {
  it("a small disc fits inside a larger ring's hole (no collision)", () => {
    // Ring outer ⌀ 24, inner ⌀ 12 — so inner radius 6.
    // Place ring at (10, 10) → ring center at (22, 22), inner-hole disc
    // covers (16..28, 16..28).
    // Small disc ⌀ 4 placed at (20, 20) → its bbox (20..24, 20..24),
    // fully inside the ring's hole.
    const parts = [ringTemplate("ring-A", 24, 12), discTemplate("disc-B", 4)]
    const ringPlacement = place("ring1", "ring-A", 10, 10)
    const proposedDisc = place("disc1", "disc-B", 20, 20)

    const collides = wouldCollide(proposedDisc, 20, 20, [ringPlacement], parts)
    expect(collides).toBe(false)
  })

  it("a disc that overlaps the ring's body (not just the hole) DOES collide", () => {
    // Same ring as above. Disc placed so part of its bbox sits on the
    // ring's solid annular region (e.g. a 4" disc whose bbox extends
    // out to x=29, beyond the inner hole's right edge at x=28).
    const parts = [ringTemplate("ring-A", 24, 12), discTemplate("disc-B", 4)]
    const ringPlacement = place("ring1", "ring-A", 10, 10)
    const proposedDisc = place("disc1", "disc-B", 25, 20)

    const collides = wouldCollide(proposedDisc, 25, 20, [ringPlacement], parts)
    expect(collides).toBe(true)
  })

  it("a disc too large to fit inside the ring's hole DOES collide", () => {
    // Ring outer ⌀ 24, inner ⌀ 12 (inner radius 6). A 14"-diameter disc
    // can't fit inside a 12" hole even when centered.
    const parts = [ringTemplate("ring-A", 24, 12), discTemplate("disc-B", 14)]
    const ringPlacement = place("ring1", "ring-A", 10, 10)
    // Center the big disc on the ring's center (22, 22).
    const proposedDisc = place("disc1", "disc-B", 15, 15)

    const collides = wouldCollide(proposedDisc, 15, 15, [ringPlacement], parts)
    expect(collides).toBe(true)
  })

  it("two non-ring parts that overlap still collide normally", () => {
    // Sanity: the exception only fires for ring overlaps. Two regular
    // discs overlapping should still collide.
    const parts = [discTemplate("disc-A", 12), discTemplate("disc-B", 12)]
    const a = place("a1", "disc-A", 10, 10)
    const b = place("b1", "disc-B", 14, 14)

    const collides = wouldCollide(b, 14, 14, [a], parts)
    expect(collides).toBe(true)
  })

  it("symmetry: if the candidate IS the ring and a small disc is already in its hole, no collision", () => {
    // Drag the ring so its hole drops onto a pre-existing small disc.
    // The candidate (ring) overlaps with the other (small disc), but
    // the small disc fits inside the ring's hole → exception applies.
    const parts = [ringTemplate("ring-A", 24, 12), discTemplate("disc-B", 4)]
    const existingDisc = place("disc1", "disc-B", 20, 20) // sits at (20..24, 20..24)
    const proposedRing = place("ring1", "ring-A", 10, 10) // ring center (22,22), hole (16..28, 16..28)

    const collides = wouldCollide(proposedRing, 10, 10, [existingDisc], parts)
    expect(collides).toBe(false)
  })
})
