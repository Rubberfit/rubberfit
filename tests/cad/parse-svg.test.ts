import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { parseSvg, SvgParseError } from "@/src/application/cad/parse-svg"
import { svgEntitiesToLoops } from "@/src/application/cad/svg-to-loops"
import { groupLoopsIntoParts } from "@/src/application/cad/group-parts"

function readFixture(name: string): string {
  return readFileSync(`tests/fixtures/svg/${name}`, "utf-8")
}

describe("parseSvg fixture: rect-with-hole.svg", () => {
  it("detects units as mm from width='100mm'", async () => {
    const doc = await parseSvg(readFixture("rect-with-hole.svg"))
    expect(doc.detectedUnits).toBe("mm")
  })

  it("emits one rect entity and one circle entity", async () => {
    const doc = await parseSvg(readFixture("rect-with-hole.svg"))
    const kinds = doc.entities.map((e) => e.kind).filter((k) => k !== "unsupported")
    expect(kinds).toContain("rect")
    expect(kinds).toContain("circle")
  })

  it("produces 1 part with 1 hole after groupLoopsIntoParts", async () => {
    const doc = await parseSvg(readFixture("rect-with-hole.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(1)
  })

  it("the outer bbox is approximately 100mm x 50mm", async () => {
    const doc = await parseSvg(readFixture("rect-with-hole.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    const { bbox } = parts[0]
    expect(bbox.maxX - bbox.minX).toBeCloseTo(100, 1)
    expect(bbox.maxY - bbox.minY).toBeCloseTo(50, 1)
  })
})

describe("parseSvg fixture: gasket-profile.svg", () => {
  it("path arc commands tessellate via unarc + Bézier flattener", async () => {
    const doc = await parseSvg(readFixture("gasket-profile.svg"))
    const pathEntity = doc.entities.find((e) => e.kind === "path")
    expect(pathEntity).toBeDefined()
    // Outer profile should have plenty of vertices from arc tessellation.
    if (pathEntity && pathEntity.kind === "path") {
      const outerLoopVerts = pathEntity.loops[0].length
      expect(outerLoopVerts).toBeGreaterThan(20)
    }
  })

  it("produces 1 part with 1 hole (the bore)", async () => {
    const doc = await parseSvg(readFixture("gasket-profile.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(1)
    expect(parts[0].polygon.holes).toHaveLength(1)
  })

  it("outer ring radius approximates 40mm (within 5% of arc tessellation)", async () => {
    const doc = await parseSvg(readFixture("gasket-profile.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    const { bbox } = parts[0]
    // OD = 80mm, so each dimension should be ~80.
    expect(bbox.maxX - bbox.minX).toBeCloseTo(80, 0)
    expect(bbox.maxY - bbox.minY).toBeCloseTo(80, 0)
  })
})

describe("parseSvg fixture: multi-path.svg", () => {
  it("produces 2 parts, each with 1 hole", async () => {
    const doc = await parseSvg(readFixture("multi-path.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part.polygon.holes).toHaveLength(1)
    }
  })

  it("the two parts are disjoint along the X axis", async () => {
    const doc = await parseSvg(readFixture("multi-path.svg"))
    const { loops } = svgEntitiesToLoops(doc)
    const parts = groupLoopsIntoParts(loops)
    expect(parts).toHaveLength(2)
    const [a, b] = parts.sort((p, q) => p.bbox.minX - q.bbox.minX)
    // a's max X must be less than b's min X (no overlap).
    expect(a.bbox.maxX).toBeLessThan(b.bbox.minX)
  })
})

describe("parseSvg fixture: transform-heavy.svg", () => {
  it("composed translate+rotate transforms produce a 45-degree rotated square in math-coords", async () => {
    const doc = await parseSvg(readFixture("transform-heavy.svg"))
    const rectEntity = doc.entities.find((e) => e.kind === "rect")
    expect(rectEntity).toBeDefined()
    if (rectEntity && rectEntity.kind === "rect") {
      // The 10x10 square centred at (-5,-5)..(5,5) rotated 45deg has
      // its corners at distance sqrt(2)*5 ≈ 7.071 from the translated
      // origin. parseSvg outputs math-coords (Y up), so the SVG
      // translate(40,40) lands the centre at (40, -40).
      const expectedRadius = Math.SQRT2 * 5
      for (const p of rectEntity.loop) {
        const dx = p.x - 40
        const dy = p.y + 40
        const r = Math.hypot(dx, dy)
        expect(r).toBeCloseTo(expectedRadius, 6)
      }
    }
  })
})

describe("parseSvg error handling", () => {
  it("throws SvgParseError on malformed XML", async () => {
    await expect(parseSvg("<svg><rect></svg")).rejects.toThrow(SvgParseError)
  })

  it("throws SvgParseError when root is not <svg>", async () => {
    await expect(parseSvg('<?xml version="1.0"?><html><body/></html>')).rejects.toThrow(
      SvgParseError
    )
  })

  it("rejects an unsupported element like <use> with the matching reason", async () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="#foo"/></svg>'
    const doc = await parseSvg(text)
    const unsupported = doc.entities.find((e) => e.kind === "unsupported")
    expect(unsupported).toBeDefined()
    if (unsupported && unsupported.kind === "unsupported") {
      expect(unsupported.reason).toBe("use-element-unsupported")
    }
  })

  it("rejects <text> with the matching reason", async () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>hi</text></svg>'
    const doc = await parseSvg(text)
    const unsupported = doc.entities.find((e) => e.kind === "unsupported")
    expect(unsupported).toBeDefined()
    if (unsupported && unsupported.kind === "unsupported") {
      expect(unsupported.reason).toBe("text-element-unsupported")
    }
  })

  it("ignores style / title / desc elements without producing an entity", async () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>x</title><desc>y</desc><style>rect{fill:red}</style><rect x="0" y="0" width="5" height="5"/></svg>'
    const doc = await parseSvg(text)
    const nonUnsupported = doc.entities.filter((e) => e.kind !== "unsupported")
    expect(nonUnsupported).toHaveLength(1)
    expect(nonUnsupported[0].kind).toBe("rect")
  })

  it("rejects <symbol> definitions without emitting their inner geometry", async () => {
    // <symbol> is a definition only — its content renders only via <use>.
    // We reject <symbol> outright and never recurse into it.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><symbol id="s1"><rect x="0" y="0" width="5" height="5"/></symbol><circle cx="10" cy="10" r="3"/></svg>'
    const doc = await parseSvg(text)
    // Expect exactly one geometry-bearing entity (the <circle>) plus one
    // "unsupported" entry for the <symbol>. The inner <rect> must NOT
    // surface.
    const geometry = doc.entities.filter((e) => e.kind !== "unsupported")
    expect(geometry).toHaveLength(1)
    expect(geometry[0].kind).toBe("circle")
    const rejected = doc.entities.find((e) => e.kind === "unsupported")
    expect(rejected).toBeDefined()
    // <symbol> must use its own reason code (not "use-element-unsupported")
    // so the warning banner shows "<symbol> ignored", not "<use> ignored".
    if (rejected && rejected.kind === "unsupported") {
      expect(rejected.reason).toBe("symbol-element-unsupported")
    }
  })

  it("rejects an open <path> (no Z command) instead of silently force-closing", async () => {
    // An L-chain without a closing Z must NOT become a phantom polygon.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M 0,0 L 10,0 L 10,10"/></svg>'
    const doc = await parseSvg(text)
    const pathEntity = doc.entities.find((e) => e.kind === "path")
    // An open path produces no loops; parsePath returns an unsupported
    // entity with the "open-path-no-z" reason in that case.
    expect(pathEntity).toBeUndefined()
    const rejected = doc.entities.find((e) => e.kind === "unsupported")
    expect(rejected).toBeDefined()
    if (rejected && rejected.kind === "unsupported") {
      expect(rejected.reason).toBe("open-path-no-z")
    }
  })

  it("rect with explicit rx=0 keeps sharp horizontal corners even when ry is positive", async () => {
    // Per SVG spec, an explicit `rx="0"` is NOT the same as omitting rx —
    // it means "no horizontal rounding". The cross-default rule only
    // fires when one of the two attributes is OMITTED.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" rx="0" ry="10"/></svg>'
    const doc = await parseSvg(text)
    const rectEntity = doc.entities.find((e) => e.kind === "rect")
    expect(rectEntity).toBeDefined()
    if (rectEntity && rectEntity.kind === "rect") {
      // Per SVG spec, any axis with explicit 0 makes the rect sharp on
      // both axes — parseRect short-circuits to the 4-corner branch.
      expect(rectEntity.loop.length).toBe(4)
    }
  })

  it("rect with only ry attribute (rx omitted) cross-defaults rx from ry — corners are rounded", async () => {
    // Per SVG spec, rx and ry default to each other when one is omitted.
    // Before the fix, this rect would render as sharp corners because rx
    // defaulted to 0 (not to ry's value), then `if (rx === 0 && ry === 0)`
    // wouldn't fire but rounded-corner tessellation would call
    // `pushArcCorner` with rx=0 — producing degenerate arcs.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" ry="10"/></svg>'
    const doc = await parseSvg(text)
    const rectEntity = doc.entities.find((e) => e.kind === "rect")
    expect(rectEntity).toBeDefined()
    if (rectEntity && rectEntity.kind === "rect") {
      // Sharp-corner rect would have exactly 4 vertices; a rounded-corner
      // rect tessellates each arc into multiple vertices, so the loop is
      // strictly longer.
      expect(rectEntity.loop.length).toBeGreaterThan(8)
    }
  })

  it("rejects <polygon points='...'> with non-numeric tokens instead of re-pairing survivors", async () => {
    // A malformed token (e.g. "foo") used to be silently dropped, leaving
    // surviving numbers to re-pair into a different polygon. We now treat
    // the whole list as malformed.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><polygon points="0,0 10,foo 20,20"/></svg>'
    const doc = await parseSvg(text)
    const polygon = doc.entities.find((e) => e.kind === "polygon")
    expect(polygon).toBeUndefined()
    const rejected = doc.entities.find(
      (e) => e.kind === "unsupported" && e.originalType === "polygon"
    )
    expect(rejected).toBeDefined()
    if (rejected && rejected.kind === "unsupported") {
      expect(rejected.reason).toBe("points-malformed")
    }
  })

  it("rejects <polyline points='...'> with an odd token count", async () => {
    // Odd number of coordinates means at least one X has no matching Y —
    // reject rather than silently dropping the dangling token.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><polyline points="0 0 1 1 2"/></svg>'
    const doc = await parseSvg(text)
    const rejected = doc.entities.find(
      (e) => e.kind === "unsupported" && e.originalType === "polyline"
    )
    expect(rejected).toBeDefined()
    if (rejected && rejected.kind === "unsupported") {
      expect(rejected.reason).toBe("points-malformed")
    }
  })

  it("silently ignores malformed transform attributes (svgpath is lenient — never throws)", async () => {
    // Empirically svgpath@^2's `.transform()` silently drops bogus tokens
    // rather than throwing — `transform="bogus(99)"` becomes the identity
    // and the shape renders with the parent transform only. The
    // `transform-malformed` reason exists as belt-and-suspenders for
    // future svgpath versions; today, the shape still emits successfully.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><rect x="0" y="0" width="10" height="10" transform="bogus(99)"/></svg>'
    const doc = await parseSvg(text)
    const rect = doc.entities.find((e) => e.kind === "rect")
    expect(rect).toBeDefined()
  })

  it("keeps the closed subpath when one closed and one open subpath share a <path>", async () => {
    // Closed triangle (first subpath) + open L-chain (second) — only the
    // closed one survives.
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path d="M 0,0 L 10,0 L 10,10 Z M 100,100 L 110,100 L 110,110"/></svg>'
    const doc = await parseSvg(text)
    const pathEntity = doc.entities.find((e) => e.kind === "path")
    expect(pathEntity).toBeDefined()
    if (pathEntity && pathEntity.kind === "path") {
      expect(pathEntity.loops).toHaveLength(1)
    }
  })
})
