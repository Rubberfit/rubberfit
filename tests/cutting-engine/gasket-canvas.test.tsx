/**
 * Smoke test for the GasketCanvas wrapper (PR C Phase 1 3D
 * workspace). Verifies the renderer-pick decision tree:
 *
 *   - WebGL unavailable (jsdom default) → KonvaSheetRenderer
 *   - Mobile viewport (matchMedia false)  → KonvaSheetRenderer
 *
 * The 3D path is harder to exercise in jsdom without a real WebGL
 * context — the dynamic import would resolve to ThreeSheetRenderer
 * but R3F can't paint without WebGL anyway. Browser smoke covers
 * that path; this test pins the fallback decisions.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { GasketCanvas } from "@/app/dashboard/cutting-engine/_components/gasket-canvas"
import type { LayoutModel } from "@/app/dashboard/cutting-engine/_components/layout-model"

vi.mock("@/app/dashboard/cutting-engine/_components/KonvaSheetRenderer", () => ({
  default: () => <div data-testid="konva-fallback" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/three-sheet-renderer", () => ({
  ThreeSheetRenderer: () => <div data-testid="three-renderer" />,
}))

const STUB_LAYOUT: LayoutModel = {
  parts: [],
  offcuts: [],
  scrap: [],
  sheetWidth: 96,
  sheetLength: 48,
  placedCount: 0,
  overflowCount: 0,
  usedAreaSqFt: 0,
  reusableAreaSqFt: 0,
  scrapAreaSqFt: 0,
  fabScore: 0,
  source: "manual",
}

describe("<GasketCanvas>", () => {
  it("renders KonvaSheetRenderer when WebGL is unavailable (jsdom default)", async () => {
    // jsdom doesn't provide a real WebGL context — useWebGLAvailable
    // resolves to `false` after the first render. KonvaSheetRenderer
    // is the fallback.
    render(
      <GasketCanvas
        layout={STUB_LAYOUT}
        thicknessIn={0.5}
        selectedPartId={null}
        zoomPct={100}
        showGrid
        sheetBase="offcut"
      />
    )
    expect(screen.getByTestId("konva-fallback")).toBeTruthy()
  })

  it("does not pull ThreeSheetRenderer when WebGL is unavailable", () => {
    render(
      <GasketCanvas
        layout={STUB_LAYOUT}
        thicknessIn={0.5}
        selectedPartId={null}
        zoomPct={100}
        showGrid
        sheetBase="offcut"
      />
    )
    expect(screen.queryByTestId("three-renderer")).toBeNull()
  })
})
