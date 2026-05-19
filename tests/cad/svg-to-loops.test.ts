import { describe, expect, it } from "vitest"
import { svgEntitiesToLoops } from "@/src/application/cad/svg-to-loops"
import type { SvgDocument } from "@/src/application/cad/svg-types"

function doc(entities: SvgDocument["entities"]): SvgDocument {
  return { detectedUnits: undefined, entities }
}

describe("svgEntitiesToLoops", () => {
  it("collects loops from rect / circle / ellipse / polygon / polyline entities", () => {
    const { loops } = svgEntitiesToLoops(
      doc([
        {
          kind: "rect",
          loop: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
        },
        {
          kind: "circle",
          loop: [
            { x: 50, y: 50 },
            { x: 51, y: 51 },
            { x: 50, y: 52 },
            { x: 49, y: 51 },
          ],
        },
      ])
    )
    expect(loops).toHaveLength(2)
  })

  it("spreads loops out of a path entity", () => {
    const { loops } = svgEntitiesToLoops(
      doc([
        {
          kind: "path",
          loops: [
            [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 },
              { x: 0, y: 5 },
            ],
            [
              { x: 100, y: 100 },
              { x: 105, y: 100 },
              { x: 105, y: 105 },
              { x: 100, y: 105 },
            ],
          ],
        },
      ])
    )
    expect(loops).toHaveLength(2)
  })

  it("collects unsupported entities into the rejected list", () => {
    const { loops, rejected } = svgEntitiesToLoops(
      doc([
        {
          kind: "rect",
          loop: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
        },
        { kind: "unsupported", originalType: "text", reason: "text-element-unsupported" },
        { kind: "unsupported", originalType: "image", reason: "image-element-unsupported" },
      ])
    )
    expect(loops).toHaveLength(1)
    expect(rejected).toEqual([
      { originalType: "text", reason: "text-element-unsupported" },
      { originalType: "image", reason: "image-element-unsupported" },
    ])
  })

  it("filters out degenerate (zero-area) loops", () => {
    const { loops } = svgEntitiesToLoops(
      doc([
        {
          kind: "polygon",
          // Three colinear points — zero area.
          loop: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
          ],
        },
        {
          kind: "rect",
          loop: [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
          ],
        },
      ])
    )
    expect(loops).toHaveLength(1)
  })

  it("filters out loops with fewer than 3 vertices", () => {
    const { loops } = svgEntitiesToLoops(
      doc([
        {
          kind: "polygon",
          loop: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
      ])
    )
    expect(loops).toHaveLength(0)
  })
})
