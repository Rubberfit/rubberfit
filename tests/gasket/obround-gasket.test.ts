import { describe, expect, it } from "vitest"

import { buildObroundGasket } from "@/src/application/gasket/obround-gasket"

function signedArea(loop: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i]
    const b = loop[(i + 1) % loop.length]
    area += a.x * b.y - b.x * a.y
  }
  return area / 2
}

describe("buildObroundGasket", () => {
  it("emits a single outer loop, no holes", () => {
    const g = buildObroundGasket({ length: 6, width: 3 })
    expect(g.holes).toHaveLength(0)
    expect(g.outer.length).toBeGreaterThanOrEqual(20)
  })

  it("bbox matches (length, width) within float epsilon", () => {
    const g = buildObroundGasket({ length: 6, width: 3 })
    const xs = g.outer.map((p) => p.x)
    const ys = g.outer.map((p) => p.y)
    const bboxW = Math.max(...xs) - Math.min(...xs)
    const bboxH = Math.max(...ys) - Math.min(...ys)
    expect(bboxW).toBeCloseTo(6, 4)
    expect(bboxH).toBeCloseTo(3, 4)
  })

  it("degenerates to a circle when length === width", () => {
    const g = buildObroundGasket({ length: 4, width: 4 })
    const xs = g.outer.map((p) => p.x)
    const ys = g.outer.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 4)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 4)
  })

  it("outer is CCW (positive signed area)", () => {
    const g = buildObroundGasket({ length: 6, width: 3 })
    expect(signedArea(g.outer)).toBeGreaterThan(0)
  })

  it("rejects when width > length (semicircular caps need width ≤ length)", () => {
    expect(() => buildObroundGasket({ length: 3, width: 6 })).toThrow()
  })

  it("rejects negative or zero dimensions", () => {
    expect(() => buildObroundGasket({ length: 0, width: 0 })).toThrow()
    expect(() => buildObroundGasket({ length: -5, width: 3 })).toThrow()
  })

  it("vertex count tracks chordDeviation (fine > coarse)", () => {
    const coarse = buildObroundGasket({ length: 6, width: 3, chordDeviation: 0.1 })
    const fine = buildObroundGasket({ length: 6, width: 3, chordDeviation: 0.001 })
    expect(fine.outer.length).toBeGreaterThan(coarse.outer.length)
  })
})
