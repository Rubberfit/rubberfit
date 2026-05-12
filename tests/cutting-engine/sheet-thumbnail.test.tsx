/**
 * Phase 5 PR 6 — smoke tests for SheetThumbnail. Pins the
 * invariants Codex flagged in pre-implementation review:
 *
 *   - Renders as a native `<button>` so keyboard activation works
 *   - Inner SVG is `aria-hidden` so screen readers don't dictate
 *     geometry; the button's aria-label carries the semantics
 *   - NO `data-sheet-svg` attribute (PDF capture in
 *     `cut-history-pdf.ts:1134` queries that selector and must NOT
 *     pick up thumbnails)
 *   - Parts inside the thumbnail SVG are NOT individually interactive
 *     (no `role="button"`, no `aria-pressed`, no `tabIndex`) so the
 *     accessibility tree doesn't expose duplicate part buttons when
 *     the detail SheetSvg also lists them
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import SheetThumbnail from "@/app/dashboard/cutting-engine/_components/sheet-thumbnail"
import type { SheetPreview } from "@/app/dashboard/cutting-engine/_components/nesting-visualizer-types"
import type { LayoutModel } from "@/app/dashboard/cutting-engine/_components/layout-model"
import type { SimpleModeLayout } from "@/app/dashboard/cutting-engine/_components/nesting-viz-simple-layout"

function makeSheet(sheetIndex: number, isPartial = false): SheetPreview {
  return {
    sheetIndex,
    isPartial,
    preview: {
      renderShape: "rect",
      strategyName: "stub",
      strategyNote: "stub",
      placementMode: "origin",
      wasteMode: "bands",
      cutPlanTitle: "",
      cutSteps: [],
      requestedUnits: 2,
      unitsCompleted: 2,
      overflowUnits: 0,
      piecesShown: 2,
      piecesPerUnit: 1,
      usedArea: 100,
      wasteArea: 50,
      wastePct: 33,
      reusableArea: 30,
      scrapArea: 20,
      occupiedWidth: 24,
      occupiedHeight: 18,
      items: [{ x: 0, y: 0, width: 12, height: 18, renderShape: "rect", label: "A" }],
      offcutBands: [],
      scrapBands: [],
      placements: [],
      label: "",
    },
  }
}

function makeLayoutModel(partsCount: number): LayoutModel {
  const parts = Array.from({ length: partsCount }, (_, i) => ({
    id: `p-${i}`,
    shapeId: `s-${i}`,
    label: `A${i}`,
    renderShape: "rect" as const,
    specIndex: 0,
    x: 0,
    y: 0,
    rotationRad: 0,
    width: 12,
    height: 18,
  }))
  return {
    sheetWidth: 36,
    sheetLength: 72,
    parts,
    offcuts: [],
    scrap: [],
    placedCount: parts.length,
    overflowCount: 0,
    usedAreaSqFt: 0,
    reusableAreaSqFt: 0,
    scrapAreaSqFt: 0,
    fabScore: 0,
    source: "rust-rf-layout",
  }
}

const STUB_LAYOUT: SimpleModeLayout = {
  viewWidth: 800,
  viewHeight: 400,
  surfaceX: 50,
  surfaceY: 30,
  effSurfaceX: 50,
  effSurfaceY: 30,
  effSurfacePxW: 700,
  effSurfacePxH: 340,
  effScale: 10,
  scale: 10,
  unitOriginX: 0,
  unitOriginY: 0,
  displayRotated: false,
  shapeFirstView: false,
  showCutPlan: false,
  isOptimizedResult: false,
  isSplitStockPreview: false,
  metricsAreEstimatedFromStock: false,
  previewTitle: "",
  layoutNote: "",
  pieceCountLabel: "Pieces",
  reusableMetricLabel: "Reusable",
  scrapMetricLabel: "Scrap",
  stockSqFt: 18,
  stockPatternId: "stock",
  offcutPatternId: "off",
  wastePatternId: "waste",
  usablePatternId: "usable",
  markerId: "m",
  displayPreview: makeSheet(0).preview,
  fabScore: { score: 80, breakdown: { waste: 80, seam: 80, reusable: 80, nesting: 80 } },
} as unknown as SimpleModeLayout

describe("SheetThumbnail", () => {
  it("renders as a button (keyboard-activatable)", () => {
    render(
      <SheetThumbnail
        sheet={makeSheet(0)}
        layoutModel={makeLayoutModel(2)}
        totalSheets={3}
        isActive={false}
        onActivate={() => undefined}
        tabIndex={-1}
        layout={STUB_LAYOUT}
      />
    )
    const btn = screen.getByRole("button", { name: /Sheet 1 of 3/ })
    expect(btn).toBeDefined()
    expect(btn.tagName).toBe("BUTTON")
  })

  it("does NOT carry data-sheet-svg (PDF capture must not pick up thumbnails)", () => {
    const { container } = render(
      <SheetThumbnail
        sheet={makeSheet(2)}
        layoutModel={makeLayoutModel(5)}
        totalSheets={4}
        isActive={true}
        onActivate={() => undefined}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    expect(container.querySelector("[data-sheet-svg]")).toBeNull()
  })

  it("aria-hides the inner SVG so the accessible name comes from the button label", () => {
    const { container } = render(
      <SheetThumbnail
        sheet={makeSheet(0)}
        layoutModel={makeLayoutModel(2)}
        totalSheets={1}
        isActive={false}
        onActivate={() => undefined}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("aria-hidden")).toBe("true")
  })

  it("exposes no interactive part children (no role=button inside the thumbnail SVG)", () => {
    const { container } = render(
      <SheetThumbnail
        sheet={makeSheet(0)}
        layoutModel={makeLayoutModel(4)}
        totalSheets={2}
        isActive={false}
        onActivate={() => undefined}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    const partButtons = container.querySelectorAll("svg [role='button']")
    expect(partButtons.length).toBe(0)
  })

  it("fires onActivate on click", () => {
    const onActivate = vi.fn()
    render(
      <SheetThumbnail
        sheet={makeSheet(1)}
        layoutModel={makeLayoutModel(3)}
        totalSheets={2}
        isActive={false}
        onActivate={onActivate}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    screen.getByRole("button").click()
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it("marks aria-pressed=true when active", () => {
    const { rerender, container } = render(
      <SheetThumbnail
        sheet={makeSheet(0)}
        layoutModel={makeLayoutModel(1)}
        totalSheets={2}
        isActive={false}
        onActivate={() => undefined}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("false")
    rerender(
      <SheetThumbnail
        sheet={makeSheet(0)}
        layoutModel={makeLayoutModel(1)}
        totalSheets={2}
        isActive={true}
        onActivate={() => undefined}
        tabIndex={0}
        layout={STUB_LAYOUT}
      />
    )
    expect(container.querySelector("button")?.getAttribute("aria-pressed")).toBe("true")
  })

  it("flags partial sheets in the aria-label", () => {
    render(
      <SheetThumbnail
        sheet={makeSheet(0, true)}
        layoutModel={makeLayoutModel(1)}
        totalSheets={3}
        isActive={false}
        onActivate={() => undefined}
        tabIndex={-1}
        layout={STUB_LAYOUT}
      />
    )
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/partial/)
  })
})
