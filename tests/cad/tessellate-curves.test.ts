import { describe, expect, it } from "vitest"
import {
  tessellateArc,
  tessellateBulge,
  tessellateCircle,
  tessellateEllipse,
  tessellateSpline,
} from "@/src/application/cad/tessellate-curves"

describe("tessellateCircle", () => {
  it("returns a closed polyline with at least 16 vertices at default tolerance", () => {
    const verts = tessellateCircle({ x: 0, y: 0 }, 1.0)
    expect(verts.length).toBeGreaterThanOrEqual(16)
    expect(verts.length).toBeLessThanOrEqual(256)
  })

  it("first and last vertex are NOT duplicates (closed loops drop the closing vertex)", () => {
    const verts = tessellateCircle({ x: 0, y: 0 }, 1.0)
    const first = verts[0]
    const last = verts[verts.length - 1]
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1e-6)
  })

  it("every vertex lies on the circle within 2x chord deviation", () => {
    const verts = tessellateCircle({ x: 0, y: 0 }, 1.0, { chordDeviation: 0.005 })
    for (const v of verts) {
      const r = Math.hypot(v.x, v.y)
      expect(Math.abs(r - 1.0)).toBeLessThan(0.01)
    }
  })

  it("scales vertex count down for larger chord deviation", () => {
    const fine = tessellateCircle({ x: 0, y: 0 }, 1.0, { chordDeviation: 0.005 })
    const coarse = tessellateCircle({ x: 0, y: 0 }, 1.0, { chordDeviation: 0.1 })
    expect(coarse.length).toBeLessThan(fine.length)
  })

  it("returns an empty array for non-positive radius", () => {
    expect(tessellateCircle({ x: 0, y: 0 }, 0)).toEqual([])
    expect(tessellateCircle({ x: 0, y: 0 }, -1)).toEqual([])
  })
})

describe("tessellateArc", () => {
  it("quarter arc spans from (1,0) to (0,1) on the unit circle", () => {
    const verts = tessellateArc({ x: 0, y: 0 }, 1.0, 0, Math.PI / 2)
    const first = verts[0]
    const last = verts[verts.length - 1]
    expect(first.x).toBeCloseTo(1, 4)
    expect(first.y).toBeCloseTo(0, 4)
    expect(last.x).toBeCloseTo(0, 4)
    expect(last.y).toBeCloseTo(1, 4)
  })

  it("emits the endpoint vertex (arcs are open, unlike circles)", () => {
    const verts = tessellateArc({ x: 0, y: 0 }, 1.0, 0, Math.PI / 2)
    const last = verts[verts.length - 1]
    // Endpoint should be exactly at the end angle, not dropped.
    expect(Math.hypot(last.x - 0, last.y - 1)).toBeLessThan(1e-9)
  })

  it("full-sweep arc produces close-to-circle vertex count plus one endpoint", () => {
    const circleVerts = tessellateCircle({ x: 0, y: 0 }, 1.0)
    const arcVerts = tessellateArc({ x: 0, y: 0 }, 1.0, 0, 2 * Math.PI)
    // Full-sweep arc has one extra vertex (the closing endpoint).
    expect(Math.abs(arcVerts.length - circleVerts.length - 1)).toBeLessThanOrEqual(1)
  })

  it("vertices distributed across arc lie on the parametric curve", () => {
    const verts = tessellateArc({ x: 2, y: -1 }, 3.0, Math.PI / 6, (5 * Math.PI) / 6)
    // Every vertex should sit on a circle of radius 3 around (2, -1).
    const samples = [
      verts[0],
      verts[Math.floor(verts.length / 3)],
      verts[Math.floor((2 * verts.length) / 3)],
      verts[verts.length - 1],
    ]
    for (const v of samples) {
      const r = Math.hypot(v.x - 2, v.y - -1)
      expect(Math.abs(r - 3.0)).toBeLessThan(0.02)
    }
  })

  it("returns an empty array for non-positive radius", () => {
    expect(tessellateArc({ x: 0, y: 0 }, 0, 0, Math.PI)).toEqual([])
  })
})

describe("tessellateEllipse", () => {
  it("with axisRatio = 1 and full sweep behaves like a circle", () => {
    const verts = tessellateEllipse({
      center: { x: 0, y: 0 },
      majorAxisEnd: { x: 1, y: 0 },
      axisRatio: 1,
      startParam: 0,
      endParam: 2 * Math.PI,
    })
    for (const v of verts) {
      const r = Math.hypot(v.x, v.y)
      expect(Math.abs(r - 1.0)).toBeLessThan(1e-6)
    }
  })

  it("rotated 45 degrees with axisRatio 0.5 — vertices match parametric ellipse", () => {
    const majorLen = 1
    const axisRatio = 0.5
    const theta = Math.PI / 4
    const majorAxisEnd = {
      x: majorLen * Math.cos(theta),
      y: majorLen * Math.sin(theta),
    }
    const verts = tessellateEllipse({
      center: { x: 0, y: 0 },
      majorAxisEnd,
      axisRatio,
      startParam: 0,
      endParam: 2 * Math.PI,
    })
    // Sample 4 vertices, verify each matches the parametric ellipse equation.
    // We can verify each vertex satisfies the rotated-ellipse equation:
    //   (x' / a)^2 + (y' / b)^2 = 1, where (x', y') is the point rotated back
    //   into the major-axis-aligned frame.
    const a = majorLen
    const b = majorLen * axisRatio
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)
    const indices = [
      0,
      Math.floor(verts.length / 4),
      Math.floor(verts.length / 2),
      Math.floor((3 * verts.length) / 4),
    ]
    for (const i of indices) {
      const v = verts[i]
      const xp = v.x * cosT + v.y * sinT
      const yp = -v.x * sinT + v.y * cosT
      const residual = (xp * xp) / (a * a) + (yp * yp) / (b * b) - 1
      expect(Math.abs(residual)).toBeLessThan(0.02)
    }
  })

  it("partial sweep (0 to pi) produces open polyline ending at diametrically opposite point", () => {
    const majorLen = 1
    const axisRatio = 0.5
    const theta = Math.PI / 4
    const majorAxisEnd = {
      x: majorLen * Math.cos(theta),
      y: majorLen * Math.sin(theta),
    }
    const verts = tessellateEllipse({
      center: { x: 0, y: 0 },
      majorAxisEnd,
      axisRatio,
      startParam: 0,
      endParam: Math.PI,
    })
    // Start param 0 in major-axis frame is (majorLen, 0); rotated → majorAxisEnd.
    // End param pi is (-majorLen, 0); rotated → -majorAxisEnd.
    const first = verts[0]
    const last = verts[verts.length - 1]
    expect(first.x).toBeCloseTo(majorAxisEnd.x, 6)
    expect(first.y).toBeCloseTo(majorAxisEnd.y, 6)
    expect(last.x).toBeCloseTo(-majorAxisEnd.x, 6)
    expect(last.y).toBeCloseTo(-majorAxisEnd.y, 6)
  })

  it("returns an empty array for zero-length major axis", () => {
    expect(
      tessellateEllipse({
        center: { x: 0, y: 0 },
        majorAxisEnd: { x: 0, y: 0 },
        axisRatio: 0.5,
        startParam: 0,
        endParam: 2 * Math.PI,
      })
    ).toEqual([])
  })
})

describe("tessellateBulge", () => {
  it("bulge = 1 (semicircle) between (0,0) and (1,0) traces a half-circle of radius 0.5 bulging UP", () => {
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)
    expect(verts.length).toBeGreaterThanOrEqual(16)
    // Every vertex is on a circle of radius 0.5 around (0.5, 0).
    for (const v of verts) {
      const r = Math.hypot(v.x - 0.5, v.y - 0)
      expect(Math.abs(r - 0.5)).toBeLessThan(0.02)
    }
    // Apex (max y) is at (0.5, 0.5) — confirms positive bulge bulges in +Y.
    let maxY = -Infinity
    for (const v of verts) if (v.y > maxY) maxY = v.y
    expect(maxY).toBeCloseTo(0.5, 2)
  })

  it("bulge = -1 (semicircle) bulges DOWN to (0.5, -0.5)", () => {
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, -1)
    let minY = Infinity
    for (const v of verts) if (v.y < minY) minY = v.y
    expect(minY).toBeCloseTo(-0.5, 2)
  })

  it("bulge = tan(pi/8) (quarter arc) bulges through the apex on the arc", () => {
    const bulge = Math.tan(Math.PI / 8)
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, bulge)
    // Sagitta = (chord/2) * tan(theta/4) = 0.5 * tan(pi/8) ≈ 0.2071.
    // Apex sits at (0.5, sagitta).
    const expectedSagitta = 0.5 * Math.tan(Math.PI / 8)
    let maxY = -Infinity
    for (const v of verts) if (v.y > maxY) maxY = v.y
    expect(maxY).toBeCloseTo(expectedSagitta, 2)
    // Radius = chord / (2*sin(theta/2)) = 1 / (2*sin(pi/4)) = 1/sqrt(2).
    // Center is at (0.5, -1/sqrt(2) + sagitta) = (0.5, -0.5).
    const radius = 1 / Math.sqrt(2)
    for (const v of verts) {
      const r = Math.hypot(v.x - 0.5, v.y - -0.5)
      expect(Math.abs(r - radius)).toBeLessThan(0.02)
    }
  })

  it("bulge = 0 returns single point (degenerate segment)", () => {
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)
    expect(verts).toEqual([{ x: 0, y: 0 }])
  })

  it("bulge between coincident points returns single point", () => {
    const verts = tessellateBulge({ x: 1, y: 2 }, { x: 1, y: 2 }, 0.5)
    expect(verts).toEqual([{ x: 1, y: 2 }])
  })

  it("does NOT emit the closing vertex b (caller appends next polyline vertex)", () => {
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)
    const last = verts[verts.length - 1]
    expect(Math.hypot(last.x - 1, last.y - 0)).toBeGreaterThan(0.01)
  })

  it("starts at vertex a", () => {
    const verts = tessellateBulge({ x: 0, y: 0 }, { x: 1, y: 0 }, 1)
    expect(verts[0].x).toBeCloseTo(0, 6)
    expect(verts[0].y).toBeCloseTo(0, 6)
  })
})

describe("tessellateSpline", () => {
  it("degree-3 spline approximating a quarter-circle stays within 1% of the unit circle", () => {
    const controlPoints = [
      { x: 1, y: 0 },
      { x: 1, y: 0.55228 },
      { x: 0.55228, y: 1 },
      { x: 0, y: 1 },
    ]
    const knots = [0, 0, 0, 0, 1, 1, 1, 1] // clamped, degree 3, 4 control points
    const verts = tessellateSpline({
      controlPoints,
      knots,
      degree: 3,
      closed: false,
    })
    expect(verts.length).toBeGreaterThan(4)
    for (const v of verts) {
      const r = Math.hypot(v.x, v.y)
      expect(Math.abs(r - 1.0)).toBeLessThan(0.01)
    }
  })

  it("hits the spline endpoints exactly (clamped knot vector)", () => {
    const controlPoints = [
      { x: 1, y: 0 },
      { x: 1, y: 0.55228 },
      { x: 0.55228, y: 1 },
      { x: 0, y: 1 },
    ]
    const knots = [0, 0, 0, 0, 1, 1, 1, 1]
    const verts = tessellateSpline({
      controlPoints,
      knots,
      degree: 3,
      closed: false,
    })
    const first = verts[0]
    const last = verts[verts.length - 1]
    expect(first.x).toBeCloseTo(1, 6)
    expect(first.y).toBeCloseTo(0, 6)
    expect(last.x).toBeCloseTo(0, 6)
    expect(last.y).toBeCloseTo(1, 6)
  })

  it("closed-loop spline omits the closing vertex (first matches last conceptually)", () => {
    const controlPoints = [
      { x: 1, y: 0 },
      { x: 1, y: 0.55228 },
      { x: 0.55228, y: 1 },
      { x: 0, y: 1 },
    ]
    const knots = [0, 0, 0, 0, 1, 1, 1, 1]
    const open = tessellateSpline({
      controlPoints,
      knots,
      degree: 3,
      closed: false,
    })
    const closed = tessellateSpline({
      controlPoints,
      knots,
      degree: 3,
      closed: true,
    })
    // Closed variant should be one shorter (no endpoint duplication).
    expect(open.length).toBe(closed.length + 1)
  })

  it("throws on rational spline (any weight !== 1.0)", () => {
    const controlPoints = [
      { x: 1, y: 0 },
      { x: 1, y: 0.55228 },
      { x: 0.55228, y: 1 },
      { x: 0, y: 1 },
    ]
    const knots = [0, 0, 0, 0, 1, 1, 1, 1]
    expect(() =>
      tessellateSpline({
        controlPoints,
        knots,
        degree: 3,
        closed: false,
        weights: [1, 2, 1, 1],
      })
    ).toThrow(/non-unit weights/i)
  })

  it("returns [] for degenerate spline (fewer control points than degree + 1)", () => {
    const verts = tessellateSpline({
      controlPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      knots: [0, 0, 1, 1],
      degree: 3,
      closed: false,
    })
    expect(verts).toEqual([])
  })

  it("handles t = tMax boundary without off-by-one (last vertex matches the endpoint)", () => {
    // Degree-2 spline, 3 control points, clamped knot [0,0,0,1,1,1].
    // At t = 1, de Boor must find span containing t=1 — boundary case.
    const verts = tessellateSpline({
      controlPoints: [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 0 },
      ],
      knots: [0, 0, 0, 1, 1, 1],
      degree: 2,
      closed: false,
    })
    const last = verts[verts.length - 1]
    expect(last.x).toBeCloseTo(2, 6)
    expect(last.y).toBeCloseTo(0, 6)
  })
})
