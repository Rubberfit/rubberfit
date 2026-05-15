/**
 * PR 0b Task 5 — Konva renderer dispatches to a compound-path
 * `<Shape>` (even-odd sceneFunc + hitFunc) when a part has holes,
 * and continues to use the flat `<Line closed>` path when it doesn't.
 *
 * Why mock `react-konva` rather than render to a real canvas:
 *   - happy-dom's CanvasRenderingContext2D is incomplete (no
 *     `fill("evenodd")` fidelity). We're not testing the visual
 *     outcome here — we're pinning the dispatch + the fact that
 *     `sceneFunc` calls `fill("evenodd")` on the underlying canvas
 *     context. Konva's own coverage handles the rest.
 *   - We DO drive the sceneFunc with a mock canvas context and
 *     assert the operations that close Codex v2 risk flag #2
 *     (compound fill, not separate fills that leak through holes).
 */

import React from "react"
import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

import type { PlacedPart } from "@/app/dashboard/cutting-engine/_components/layout-model"
import type { KonvaThemeTokens } from "@/app/dashboard/cutting-engine/_components/konva-theme"

const capturedShapeProps: Array<{
  sceneFunc?: (context: unknown, shape: unknown) => void
  hitFunc?: (context: unknown, shape: unknown) => void
}> = []

let lastBodyTag: string | null = null

vi.mock("react-konva", () => {
  const recordTag = (tag: string) => () => {
    lastBodyTag = tag
    return null
  }
  return {
    Group: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Text: () => null,
    Circle: recordTag("Circle"),
    Ellipse: recordTag("Ellipse"),
    Ring: recordTag("Ring"),
    Rect: recordTag("Rect"),
    Line: () => {
      lastBodyTag = "Line"
      return null
    },
    Shape: (props: { sceneFunc?: unknown; hitFunc?: unknown }) => {
      lastBodyTag = "Shape"
      capturedShapeProps.push(props as never)
      return null
    },
  }
})

const PartShape = (await import("@/app/dashboard/cutting-engine/_components/konva-part-shape"))
  .default

const THEME = {
  sheetFill: "#1c1917",
  sheetStroke: "#44403c",
  grid: "#374151",
  offcutFill: "#fde68a",
  offcutStroke: "#f59e0b",
  scrapFill: "#fecaca",
  scrapStroke: "#ef4444",
  labelFill: "#0f172a",
  labelStroke: "#ffffff",
  partStroke: "#94a3b8",
  selectedStroke: "#14b8a6",
  elevationShadow: "#000000",
} as unknown as KonvaThemeTokens

function ringPart(): PlacedPart {
  return {
    id: "r1",
    shapeId: "ring",
    label: "A",
    renderShape: "polygon",
    specIndex: 0,
    x: 1,
    y: 1,
    rotationRad: 0,
    width: 12,
    height: 12,
    polygon: [
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 13, y: 13 },
      { x: 1, y: 13 },
    ],
    holes: [
      [
        { x: 5, y: 5 },
        { x: 9, y: 5 },
        { x: 9, y: 9 },
        { x: 5, y: 9 },
      ],
    ],
  }
}

function plainPart(): PlacedPart {
  const ring = ringPart()
  return { ...ring, holes: undefined }
}

describe("PR 0b — Konva renderer dispatches to compound Shape for hole-bearing parts", () => {
  it("renders a `<Shape>` (compound path) when the part has holes", () => {
    lastBodyTag = null
    capturedShapeProps.length = 0
    render(
      <PartShape
        part={ringPart()}
        scale={1}
        fill="#fef3c7"
        theme={THEME}
        isDark={false}
        isDraggable={false}
        isSelected={false}
      />
    )
    expect(lastBodyTag).toBe("Shape")
    expect(capturedShapeProps[0].sceneFunc).toBeTypeOf("function")
    expect(capturedShapeProps[0].hitFunc).toBeTypeOf("function")
  })

  it("renders a `<Line>` (flat closed loop) when the part has no holes", () => {
    lastBodyTag = null
    capturedShapeProps.length = 0
    render(
      <PartShape
        part={plainPart()}
        scale={1}
        fill="#fef3c7"
        theme={THEME}
        isDark={false}
        isDraggable={false}
        isSelected={false}
      />
    )
    expect(lastBodyTag).toBe("Line")
  })

  it("`sceneFunc` builds a compound path and calls `fill('evenodd')` on the underlying canvas", () => {
    lastBodyTag = null
    capturedShapeProps.length = 0
    render(
      <PartShape
        part={ringPart()}
        scale={2}
        fill="#fef3c7"
        theme={THEME}
        isDark={false}
        isDraggable={false}
        isSelected={false}
      />
    )
    const sceneFunc = capturedShapeProps[0].sceneFunc!

    // Mock canvas context. Konva.Context exposes `_context` as the
    // underlying CanvasRenderingContext2D — our compound-path renderer
    // calls `fill` and `stroke` directly on that.
    const rawCalls: Array<{ method: string; args: unknown[] }> = []
    const rawContext = {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      fill: (rule?: string) => rawCalls.push({ method: "fill", args: rule ? [rule] : [] }),
      stroke: () => rawCalls.push({ method: "stroke", args: [] }),
    }
    const pathCalls: Array<{ method: string; args: unknown[] }> = []
    const konvaContext = {
      _context: rawContext,
      beginPath: () => pathCalls.push({ method: "beginPath", args: [] }),
      moveTo: (x: number, y: number) => pathCalls.push({ method: "moveTo", args: [x, y] }),
      lineTo: (x: number, y: number) => pathCalls.push({ method: "lineTo", args: [x, y] }),
      closePath: () => pathCalls.push({ method: "closePath", args: [] }),
    }
    sceneFunc(konvaContext, {} as unknown)

    // Compound path: ONE beginPath, then outer ring (moveTo + 3 lineTo
    // + closePath), then hole (moveTo + 3 lineTo + closePath).
    const begins = pathCalls.filter((c) => c.method === "beginPath").length
    expect(begins).toBe(1)
    const moveTos = pathCalls.filter((c) => c.method === "moveTo").length
    const closePaths = pathCalls.filter((c) => c.method === "closePath").length
    expect(moveTos).toBe(2) // outer + 1 hole
    expect(closePaths).toBe(2)

    // Compound fill with even-odd rule, then stroke for cut-line
    // visualization.
    const fills = rawCalls.filter((c) => c.method === "fill")
    expect(fills).toHaveLength(1)
    expect(fills[0].args).toEqual(["evenodd"])
    expect(rawCalls.some((c) => c.method === "stroke")).toBe(true)
  })

  it("`hitFunc` fills the same compound path with even-odd so clicks in a hole pass through", () => {
    lastBodyTag = null
    capturedShapeProps.length = 0
    render(
      <PartShape
        part={ringPart()}
        scale={1}
        fill="#fef3c7"
        theme={THEME}
        isDark={false}
        isDraggable={false}
        isSelected={false}
      />
    )
    const hitFunc = capturedShapeProps[0].hitFunc!

    const fills: Array<unknown[]> = []
    const rawContext = {
      fillStyle: "",
      fill: (...args: unknown[]) => fills.push(args),
    }
    const konvaContext = {
      _context: rawContext,
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
    }
    hitFunc(konvaContext, { colorKey: "#abc123" } as unknown)

    expect(fills).toHaveLength(1)
    expect(fills[0]).toEqual(["evenodd"])
    expect(rawContext.fillStyle).toBe("#abc123")
  })
})
