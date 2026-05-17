/**
 * Smoke test for the GasketCuttingContent shell (PR C Commit 5).
 *
 * Pins:
 *   - Renders the three-column shell with the queue header + buttons
 *     when the queue is empty.
 *   - When given parts, the queue card label appears.
 *   - "Save cut" is disabled with zero placements.
 *
 * Mocks the heavy children (Konva, stock editor, toolbar, add-gasket
 * sheet, preview SVG) + the cut-history hooks so the shell can render
 * in happy-dom without canvas or Supabase deps.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/app/dashboard/cutting-engine/_components/KonvaSheetRenderer", () => ({
  default: () => <div data-testid="konva-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/free-roam-stock-editor", () => ({
  FreeRoamStockEditor: () => <div data-testid="stock-editor-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/canvas-toolbar", () => ({
  CanvasToolbar: () => <div data-testid="toolbar-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/add-gasket-sheet", () => ({
  AddGasketSheet: () => <div data-testid="add-gasket-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/gasket-preview-svg", () => ({
  GasketPreviewSvg: () => <div data-testid="preview-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/use-record-manual-cut", () => ({
  useRecordManualCut: () => ({ isRecordingCut: false, recordCut: vi.fn() }),
}))

vi.mock("@/app/dashboard/cutting-engine/_components/use-load-manual-cut", () => ({
  useLoadManualCut: () => vi.fn(),
}))

import GasketCuttingContent from "@/app/dashboard/cutting-engine/_components/gasket-cutting-content"
import { gasketSpecToPartTemplate } from "@/app/dashboard/cutting-engine/_components/gasket-template"

const DEFAULT_STOCK = {
  width: 96,
  length: 48,
  material: "EPDM",
  thickness: 0.5,
  kerf: 0.0625,
}

describe("<GasketCuttingContent>", () => {
  it("renders the three-column shell with empty queue", () => {
    render(
      <GasketCuttingContent
        parts={[]}
        onPartsChange={vi.fn()}
        stock={DEFAULT_STOCK}
        onStockChange={vi.fn()}
        refreshKey={0}
        onCutRecorded={vi.fn()}
      />
    )
    expect(screen.getAllByText(/Gasket queue/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Add gasket/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Import CAD/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/No gaskets in queue/i).length).toBeGreaterThan(0)
    expect(screen.getByTestId("konva-stub")).toBeTruthy()
  })

  it("renders queue card labels when parts present", () => {
    const partial = gasketSpecToPartTemplate({
      kind: "ring",
      outerDiameter: 12,
      innerDiameter: 8,
    })
    const part = { ...partial, id: "g1", quantity: 2 }
    render(
      <GasketCuttingContent
        parts={[part]}
        onPartsChange={vi.fn()}
        stock={DEFAULT_STOCK}
        onStockChange={vi.fn()}
        refreshKey={0}
        onCutRecorded={vi.fn()}
      />
    )
    expect(screen.getAllByText(/Ring · OD 12/).length).toBeGreaterThan(0)
  })

  it("Save cut is disabled with zero placements", () => {
    render(
      <GasketCuttingContent
        parts={[]}
        onPartsChange={vi.fn()}
        stock={DEFAULT_STOCK}
        onStockChange={vi.fn()}
        refreshKey={0}
        onCutRecorded={vi.fn()}
      />
    )
    const saveBtn = screen.getByRole("button", { name: /Save cut/i })
    if (!(saveBtn instanceof HTMLButtonElement)) throw new Error("Save cut is not a button")
    expect(saveBtn.disabled).toBe(true)
  })
})
