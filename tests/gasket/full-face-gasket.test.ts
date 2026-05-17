import { describe, expect, it } from "vitest"

import { buildFullFaceGasket } from "@/src/application/gasket/full-face-gasket"

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

describe("buildFullFaceGasket", () => {
  const baseSpec = {
    outerDiameter: 16,
    boreInnerDiameter: 8,
    boltCircleDiameter: 12,
    boltCount: 8,
    boltHoleDiameter: 0.75,
  }

  it("emits one outer loop plus (1 + boltCount) holes (bore + bolts)", () => {
    const g = buildFullFaceGasket(baseSpec)
    expect(g.outer.length).toBeGreaterThanOrEqual(16)
    expect(g.holes).toHaveLength(1 + baseSpec.boltCount)
  })

  it("bolt holes are evenly spaced on the bolt-circle diameter (handles wraparound)", () => {
    const g = buildFullFaceGasket(baseSpec)
    // Hole 0 is the bore (centered at origin); holes 1..N are bolts.
    const boltHoles = g.holes.slice(1)
    const centers = boltHoles.map((hole) => {
      const cx = hole.reduce((s, p) => s + p.x, 0) / hole.length
      const cy = hole.reduce((s, p) => s + p.y, 0) / hole.length
      return { cx, cy }
    })
    // Every bolt-hole center sits on the BCD circle within 0.5% tol.
    const bcdRadius = baseSpec.boltCircleDiameter / 2
    for (const { cx, cy } of centers) {
      const r = Math.sqrt(cx * cx + cy * cy)
      expect(Math.abs(r - bcdRadius) / bcdRadius).toBeLessThan(0.005)
    }
    // Consecutive angles differ by 2π/N within tolerance — INCLUDING
    // the wraparound from last → first (mod 2π).
    const angles = centers.map(({ cx, cy }) => Math.atan2(cy, cx)).sort((a, b) => a - b)
    const expectedStep = (2 * Math.PI) / baseSpec.boltCount
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 === angles.length ? angles[0] + 2 * Math.PI : angles[i + 1]
      expect(Math.abs(next - angles[i] - expectedStep)).toBeLessThan(0.01)
    }
  })

  it("net area matches outer minus bore minus N bolt-hole areas within 0.5%", () => {
    const g = buildFullFaceGasket(baseSpec)
    const outerA = polygonArea(g.outer)
    const holesA = g.holes.reduce((s, h) => s + polygonArea(h), 0)
    const expectedOuter = Math.PI * 8 * 8
    const expectedBore = Math.PI * 4 * 4
    const expectedBolt = Math.PI * 0.375 * 0.375
    const expectedHoles = expectedBore + 8 * expectedBolt
    expect(Math.abs(outerA - expectedOuter) / expectedOuter).toBeLessThan(0.005)
    expect(Math.abs(holesA - expectedHoles) / expectedHoles).toBeLessThan(0.005)
  })

  it("outer is CCW (positive signed area) and every hole is CW (negative)", () => {
    const g = buildFullFaceGasket(baseSpec)
    expect(signedArea(g.outer)).toBeGreaterThan(0)
    for (const hole of g.holes) {
      expect(signedArea(hole)).toBeLessThan(0)
    }
  })

  it("respects boltStartAngleRad — first bolt sits at the requested angle", () => {
    const g = buildFullFaceGasket({ ...baseSpec, boltStartAngleRad: Math.PI / 4 })
    const firstBolt = g.holes[1]
    const cx = firstBolt.reduce((s, p) => s + p.x, 0) / firstBolt.length
    const cy = firstBolt.reduce((s, p) => s + p.y, 0) / firstBolt.length
    expect(Math.atan2(cy, cx)).toBeCloseTo(Math.PI / 4, 4)
  })

  it("ASME boundary: boltCount=2 and boltCount=32 both succeed", () => {
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 2 })).not.toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 32 })).not.toThrow()
  })

  it("rejects boltCount < 2 or > 32 (ASME flange standard, spec §4.2)", () => {
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 1 })).toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 33 })).toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 0 })).toThrow()
  })

  it("rejects non-integer boltCount", () => {
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCount: 4.5 })).toThrow()
  })

  it("rejects geometry inversions (BCD outside OD, bore + bolt holes overlap)", () => {
    // BCD + bolt-hole radius must fit inside OD.
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCircleDiameter: 16.5 })).toThrow()
    // Bore must not reach the bolt-hole inner edge (strict gap).
    expect(() => buildFullFaceGasket({ ...baseSpec, boreInnerDiameter: 12.5 })).toThrow()
    // Tangent case also rejected (>=).
    const tangentBore = baseSpec.boltCircleDiameter - baseSpec.boltHoleDiameter
    expect(() => buildFullFaceGasket({ ...baseSpec, boreInnerDiameter: tangentBore })).toThrow()
  })

  it("rejects negative or zero diameter inputs", () => {
    expect(() => buildFullFaceGasket({ ...baseSpec, outerDiameter: 0 })).toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boreInnerDiameter: -1 })).toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boltCircleDiameter: 0 })).toThrow()
    expect(() => buildFullFaceGasket({ ...baseSpec, boltHoleDiameter: -0.1 })).toThrow()
  })
})
