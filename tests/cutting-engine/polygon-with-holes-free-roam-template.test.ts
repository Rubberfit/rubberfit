// PR 0b — `PartTemplate` carries optional `holes?: Point2D[][]` and
// the Free-roam build path mirrors the placement transform onto each
// hole so the resulting `PlacedPart.holes` lives in sheet space (the
// same convention `polygon` uses).
//
// Pins:
//   1. A template with holes produces a PlacedPart whose `holes` are
//      transformed into sheet space at the placement's position +
//      rotation.
//   2. A template without holes produces a PlacedPart whose `holes`
//      stays undefined — the no-op contract for hole-blind shapes.
//   3. The memo-reuse check (`canReusePart`) invalidates when the
//      template's hole count changes (Codex sign-off flag).

import { describe, expect, it } from "vitest"

import { buildFreeRoamLayout } from "@/app/dashboard/cutting-engine/_components/free-roam-layout"
import type { ManualPlacement } from "@/app/dashboard/cutting-engine/_components/free-roam-collision"
import type { PartTemplate } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { PlacedPart } from "@/app/dashboard/cutting-engine/_components/layout-model"
import type { StockConfig } from "@/app/dashboard/cutting-engine/_components/stock-preview-configurator"
import { assertNotNull } from "../_helpers/assert-not-null"

const STOCK: StockConfig = {
  width: 48,
  length: 96,
  material: "rubber",
  thickness: 0.25,
  kerf: 0.125,
}

const PLACEMENT: ManualPlacement = {
  id: "pl-1",
  templateId: "ring",
  x: 5,
  y: 7,
  rotationRad: 0,
}

const SQUARE_RING_TEMPLATE: PartTemplate = {
  id: "ring",
  partType: "rectangle",
  label: "Square ring",
  summary: "10×10 outer, 4×4 hole centered",
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
      { x: 3, y: 3 },
      { x: 7, y: 3 },
      { x: 7, y: 7 },
      { x: 3, y: 7 },
    ],
  ],
}

const PLAIN_SQUARE_TEMPLATE: PartTemplate = {
  ...SQUARE_RING_TEMPLATE,
  holes: undefined,
}

const TAG_MAP = new Map([["ring", "A"]])

describe("PR 0b — PartTemplate.holes flows through Free-roam build", () => {
  it("transforms each hole loop into sheet space at the placement's position", () => {
    const layout = buildFreeRoamLayout([PLACEMENT], [SQUARE_RING_TEMPLATE], STOCK, TAG_MAP)
    const placed = layout.parts[0]
    expect(placed.holes).toHaveLength(1)
    assertNotNull(placed.holes)
    const hole = placed.holes[0]
    expect(hole).toHaveLength(4)
    // Placement origin is (5,7); template hole vertex (3,3) sits at
    // sheet-space (5 + 3, 7 + 3) = (8, 10) under zero rotation.
    expect(hole[0]).toEqual({ x: 8, y: 10 })
    expect(hole[2]).toEqual({ x: 12, y: 14 })
  })

  it("leaves `holes` undefined when the template has no holes", () => {
    const layout = buildFreeRoamLayout([PLACEMENT], [PLAIN_SQUARE_TEMPLATE], STOCK, TAG_MAP)
    expect(layout.parts[0].holes).toBeUndefined()
  })

  it("rotates hole vertices around the placement center alongside the outer polygon", () => {
    const rotated: ManualPlacement = {
      ...PLACEMENT,
      x: 0,
      y: 0,
      rotationRad: Math.PI / 2,
    }
    const layout = buildFreeRoamLayout([rotated], [SQUARE_RING_TEMPLATE], STOCK, TAG_MAP)
    const placed = layout.parts[0]
    // Square center after rotation about (5, 5) by 90°: each hole
    // vertex (3,3) goes to (7, 3); ring symmetric so we expect a
    // structurally rotated rectangle of the same four points.
    assertNotNull(placed.holes)
    const xs = placed.holes[0].map((p) => Math.round(p.x * 1e6) / 1e6)
    const ys = placed.holes[0].map((p) => Math.round(p.y * 1e6) / 1e6)
    expect(new Set(xs)).toEqual(new Set([3, 7]))
    expect(new Set(ys)).toEqual(new Set([3, 7]))
  })

  it("invalidates memo reuse when the template's hole count changes", () => {
    const prevMap = new Map<string, PlacedPart>()
    const first = buildFreeRoamLayout(
      [PLACEMENT],
      [SQUARE_RING_TEMPLATE],
      STOCK,
      TAG_MAP,
      prevMap
    )
    const firstPart = first.parts[0]

    // Same placement, no template edits — memo MUST hit (same object reference).
    const memoHit = buildFreeRoamLayout(
      [PLACEMENT],
      [SQUARE_RING_TEMPLATE],
      STOCK,
      TAG_MAP,
      prevMap
    )
    expect(memoHit.parts[0]).toBe(firstPart)

    // Remove the hole from the template — memo MUST bust.
    const editedTemplate = { ...SQUARE_RING_TEMPLATE, holes: undefined }
    const memoBust = buildFreeRoamLayout([PLACEMENT], [editedTemplate], STOCK, TAG_MAP, prevMap)
    expect(memoBust.parts[0]).not.toBe(firstPart)
    expect(memoBust.parts[0].holes).toBeUndefined()
  })
})
