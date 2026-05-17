import { describe, expect, it } from "vitest"

import { buildRingGasket } from "@/src/application/gasket/ring-gasket"

function polygonArea(loop: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function signedArea(loop: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

describe("buildRingGasket", () => {
  it("emits one outer loop and one inner hole loop", () => {
    const g = buildRingGasket({ outerDiameter: 12, innerDiameter: 8 })
    expect(g.outer.length).toBeGreaterThanOrEqual(16)
    expect(g.holes).toHaveLength(1)
    expect(g.holes[0].length).toBeGreaterThanOrEqual(16)
  })

  it("net area matches π(R² − r²) within 0.5% (default chord deviation)", () => {
    const g = buildRingGasket({ outerDiameter: 12, innerDiameter: 8 })
    const expected = Math.PI * (6 * 6 - 4 * 4)
    const actual = polygonArea(g.outer) - polygonArea(g.holes[0])
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.005)
  })

  it("loops are not duplicate-closed (first vertex !== last vertex)", () => {
    const g = buildRingGasket({ outerDiameter: 10, innerDiameter: 6 })
    const first = g.outer[0]
    const last = g.outer[g.outer.length - 1]
    expect(first.x === last.x && first.y === last.y).toBe(false)
  })

  it("outer is CCW (positive signed area) and hole is CW (negative)", () => {
    // Orientation contract: see sanitize-polygon-with-holes.ts and the
    // jagua-rs adapter — outer rings CCW, hole rings CW in math coords.
    const g = buildRingGasket({ outerDiameter: 12, innerDiameter: 8 })
    expect(signedArea(g.outer)).toBeGreaterThan(0)
    expect(signedArea(g.holes[0])).toBeLessThan(0)
  })

  it("rejects when innerDiameter >= outerDiameter", () => {
    expect(() => buildRingGasket({ outerDiameter: 8, innerDiameter: 8 })).toThrow()
    expect(() => buildRingGasket({ outerDiameter: 8, innerDiameter: 9 })).toThrow()
  })

  it("rejects negative or zero diameters", () => {
    expect(() => buildRingGasket({ outerDiameter: 0, innerDiameter: 0 })).toThrow()
    expect(() => buildRingGasket({ outerDiameter: -5, innerDiameter: 2 })).toThrow()
  })

  it("tessellation density scales with chordDeviation", () => {
    const coarse = buildRingGasket({ outerDiameter: 12, innerDiameter: 8, chordDeviation: 0.1 })
    const fine = buildRingGasket({ outerDiameter: 12, innerDiameter: 8, chordDeviation: 0.001 })
    expect(fine.outer.length).toBeGreaterThan(coarse.outer.length)
  })

  it("very small gasket still tessellates (minVertices floor)", () => {
    const g = buildRingGasket({ outerDiameter: 0.5, innerDiameter: 0.25 })
    // minVertices = 16 floors any sub-chord-deviation diameter
    expect(g.outer.length).toBeGreaterThanOrEqual(16)
    expect(g.holes[0].length).toBeGreaterThanOrEqual(16)
  })

  it("large gasket scales vertex count (100\" OD)", () => {
    const g = buildRingGasket({ outerDiameter: 100, innerDiameter: 90 })
    expect(g.outer.length).toBeGreaterThan(200)
  })
})
