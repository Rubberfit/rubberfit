/**
 * Structural snapshot for the GasketCuttingContent workspace (PR C
 * Commit 7). Konva is mocked because happy-dom can't paint canvas;
 * we snapshot the React tree wrapping the renderer instead, which is
 * enough to detect structural regressions in the three-column shell
 * + queue + metrics rail.
 */
import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/app/dashboard/cutting-engine/_components/KonvaSheetRenderer", () => ({
  default: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="konva-renderer-stub">{children}</div>
  ),
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

vi.mock("@/app/dashboard/cutting-engine/_components/dxf-review-dialog", () => ({
  default: () => <div data-testid="dxf-review-stub" />,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/svg-review-dialog", () => ({
  default: () => <div data-testid="svg-review-stub" />,
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

describe("<GasketCuttingContent> structural snapshot", () => {
  it("matches the rendered tree for a ring + full-face queue", () => {
    const ringTmpl = {
      ...gasketSpecToPartTemplate({ kind: "ring", outerDiameter: 12, innerDiameter: 8 }),
      id: "snapshot-ring",
      quantity: 1,
    }
    const fullFaceTmpl = {
      ...gasketSpecToPartTemplate({
        kind: "full-face",
        outerDiameter: 16,
        boreInnerDiameter: 8,
        boltCircleDiameter: 12,
        boltCount: 8,
        boltHoleDiameter: 0.75,
      }),
      id: "snapshot-fullface",
      quantity: 1,
    }
    const { container } = render(
      <GasketCuttingContent
        parts={[ringTmpl, fullFaceTmpl]}
        onPartsChange={() => {}}
        stock={DEFAULT_STOCK}
        onStockChange={() => {}}
        refreshKey={0}
        onCutRecorded={() => {}}
      />
    )
    // Use the first child of container — render wraps everything in a
    // document fragment; the workspace root is the first element.
    expect(container.firstChild).toMatchSnapshot()
  })
})
