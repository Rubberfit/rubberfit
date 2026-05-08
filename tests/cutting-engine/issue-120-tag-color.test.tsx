/**
 * Regression tests for GitHub issue #120 — "Simple coloring bug" in the
 * cut planner SVG preview.
 *
 * The bug: tag letters (A, B, C, …) drawn on top of placed shapes
 * sometimes rendered near-white, making them invisible against the
 * lime-green usable pattern. Repro depended on shape type — Polygon
 * and Rect text used `fill-foreground` (theme-aware, near-black in
 * light mode) but Circle, Sector, and Trapezoid had a hardcoded
 * `fill-stone-200` (light gray) → the inconsistency Steven hit.
 *
 * The fix swaps every shape's tag-text class to `fill-foreground` so the
 * letters track the theme variable and stay legible in both light and
 * dark modes. These tests render each shape variant via
 * `renderToStaticMarkup` and assert the text element's class.
 */
import { describe, it, expect } from "vitest"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import NestingShapeRenderer from "@/app/dashboard/cutting-engine/_components/nesting-shape-renderer"
import type {
  PreviewItem,
  SimplePartPreview,
} from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"

const STUB_PREVIEW: SimplePartPreview = {
  renderShape: "rect",
  strategyName: "stub",
  strategyNote: "stub",
  placementMode: "origin",
  wasteMode: "bands",
  cutPlanTitle: "",
  cutSteps: [],
  requestedUnits: 0,
  unitsCompleted: 0,
  overflowUnits: 0,
  piecesShown: 0,
  piecesPerUnit: 0,
  usedArea: 0,
  wasteArea: 0,
  wastePct: 0,
  reusableArea: 0,
  scrapArea: 0,
  occupiedWidth: 0,
  occupiedHeight: 0,
  items: [],
  offcutBands: [],
  scrapBands: [],
  placements: [],
  label: "",
}

function renderShape(item: PreviewItem, tagLetter = "A"): string {
  return renderToStaticMarkup(
    <svg>
      <NestingShapeRenderer
        item={item}
        index={0}
        surfaceX={0}
        surfaceY={0}
        unitOriginX={0}
        unitOriginY={0}
        scale={10}
        partGradientId="part"
        tagLetter={tagLetter}
        zoom={1}
      />
    </svg>
  )
}

function rectItem(): PreviewItem {
  return { x: 0, y: 0, width: 24, height: 14, renderShape: "rect", label: "24x14" }
}

function circleItem(): PreviewItem {
  return {
    x: 0,
    y: 0,
    width: 18,
    height: 18,
    renderShape: "circle",
    label: "Ø18",
    diameter: 18,
  }
}

function sectorItem(): PreviewItem {
  return {
    x: 0,
    y: 0,
    width: 36,
    height: 18,
    renderShape: "sector",
    label: "120° sector",
    innerRadius: 2,
    outerRadius: 18,
    arcDegrees: 120,
  }
}

function trapezoidItem(): PreviewItem {
  return {
    x: 0,
    y: 0,
    width: 28,
    height: 40,
    renderShape: "trapezoid",
    label: "20/28x40",
    topWidth: 20,
    bottomWidth: 28,
  }
}

function polygonItem(): PreviewItem {
  // Has placedPolygon → renders via PolygonShape path
  return {
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    renderShape: "rect",
    label: "polygon",
    placedPolygon: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
  }
}

interface ShapeCase {
  name: string
  build: () => PreviewItem
}

const SHAPE_CASES: ReadonlyArray<ShapeCase> = [
  { name: "rect", build: rectItem },
  { name: "circle", build: circleItem },
  { name: "sector", build: sectorItem },
  { name: "trapezoid", build: trapezoidItem },
  { name: "polygon (NFP-rotated)", build: polygonItem },
]

describe("issue #120 — tag letters render with theme-aware fill on every shape kind", () => {
  for (const { name, build } of SHAPE_CASES) {
    it(`${name}: tag text uses fill-foreground (never the legacy hardcoded near-white)`, () => {
      const html = renderShape(build(), "A")
      // The tag text must be present
      expect(html, `${name} markup missing tag letter`).toContain(">A</text>")
      // …and must use the theme-aware foreground class
      expect(html, `${name} markup missing fill-foreground`).toContain('class="fill-foreground"')
      // …and must NOT use the legacy hardcoded light gray that caused #120
      expect(
        html,
        `${name} still uses legacy fill-stone-200 — issue #120 regression`
      ).not.toContain("fill-stone-200")
    })
  }

  it("falls back to item.label and still uses fill-foreground when tagLetter is missing", () => {
    // Render directly without going through the renderShape default arg
    const html = renderToStaticMarkup(
      <svg>
        <NestingShapeRenderer
          item={rectItem()}
          index={0}
          surfaceX={0}
          surfaceY={0}
          unitOriginX={0}
          unitOriginY={0}
          scale={10}
          partGradientId="part"
          zoom={1}
        />
      </svg>
    )
    expect(html).toContain(">24x14</text>")
    expect(html).toContain('class="fill-foreground"')
  })
})
