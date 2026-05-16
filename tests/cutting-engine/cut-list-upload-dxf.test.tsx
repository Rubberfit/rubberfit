/**
 * Component test for the DXF branch of CutListUpload.
 *
 * Pins (post-PR-A — curves + holes + multi-loop):
 *   - Multi-loop DXF (two-rectangles.dxf, two-disjoint-parts.dxf): the
 *     review dialog OPENS with multiple parts in its `parts` array; no
 *     toast.error fires.
 *   - Bulged-polyline DXF: tessellates and opens the review dialog with
 *     a single part.
 *   - Ring gasket: opens the dialog with a single part whose polygon
 *     has one hole.
 *   - Bracket with bolt holes: opens with a single part whose polygon
 *     has four holes; clicking confirm forwards the sanitized
 *     PolygonWithHoles (with 4 holes) to `onDxfPartConfirmed`.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import React from "react"
import { fireEvent, render, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const toast = vi.hoisted(() => ({
  message: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/src/infrastructure/services/visionExtractionService", () => ({
  extractFromImage: vi.fn(),
}))

vi.mock("@/app/dashboard/cutting-engine/_components/spreadsheet-parser", () => ({
  parseSpreadsheet: vi.fn(),
}))

// Stub the DXF review dialog so we can observe its props directly
// without rendering the full Radix dialog tree (happy-dom Portal
// quirks). The stub also exposes its latest props (and a hook to fire
// the onConfirm callback) so the confirm-path test can drive the
// downstream handler without mounting the real dialog.
interface DialogProps {
  open: boolean
  parts: Array<{
    index: number
    polygon: {
      outer: Array<{ x: number; y: number }>
      holes: Array<Array<{ x: number; y: number }>>
    }
    bbox: { minX: number; minY: number; maxX: number; maxY: number }
  }>
  detectedUnits?: "mm" | "inch"
  rejected: unknown[]
  ignoredLayers: string[]
  sourceFile: string
  onConfirm: (part: {
    partNumber: string
    polygon: {
      outer: Array<{ x: number; y: number }>
      holes: Array<Array<{ x: number; y: number }>>
    }
    quantity: number
    units: "mm" | "inch"
    sourceFile: string
  }) => void
  onCancel: () => void
}
const mockDialog = vi.hoisted(() => vi.fn((_props: DialogProps) => null))
vi.mock("@/app/dashboard/cutting-engine/_components/dxf-review-dialog", () => ({
  __esModule: true,
  default: mockDialog,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/upload-review-dialog", () => ({
  __esModule: true,
  default: () => null,
}))

import CutListUpload from "@/app/dashboard/cutting-engine/_components/cut-list-upload"

function loadFixture(name: string): File {
  const text = readFileSync(resolve("tests/fixtures/dxf", `${name}.dxf`), "utf8")
  return new File([text], `${name}.dxf`, { type: "application/dxf" })
}

function dropFile(container: HTMLElement, file: File) {
  const dropzone = container.querySelector<HTMLDivElement>('[data-testid="upload-dropzone"]')
  if (!dropzone) throw new Error("dropzone not found")
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [file] },
  })
}

function lastOpenCall(): DialogProps | undefined {
  for (let i = mockDialog.mock.calls.length - 1; i >= 0; i--) {
    const props = mockDialog.mock.calls[i][0]
    if (props?.open === true) return props
  }
  return undefined
}

describe("CutListUpload — DXF branch", () => {
  beforeEach(() => {
    toast.error.mockClear()
    toast.success.mockClear()
    mockDialog.mockClear()
  })

  it("opens the review dialog with 2 parts for a two-rectangle DXF (multi-part import now supported)", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("two-rectangles"))

    await waitFor(() => {
      expect(lastOpenCall()).toBeDefined()
    })
    const props = lastOpenCall()!
    expect(props.parts.length).toBe(2)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("opens the review dialog for a bulged-polyline DXF (curves now tessellated)", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("lwpolyline-with-bulge"))

    await waitFor(() => {
      expect(lastOpenCall()).toBeDefined()
    })
    const props = lastOpenCall()!
    expect(props.parts.length).toBe(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("opens the DXF review dialog for a single-loop closed-LWPOLYLINE DXF", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("rectangle"))

    await waitFor(() => {
      expect(lastOpenCall()).toBeDefined()
    })
    const props = lastOpenCall()!
    expect(props.parts.length).toBe(1)
    expect(props.parts[0].polygon.holes.length).toBe(0)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("opens the dialog with 1 part and 1 hole for ring-gasket.dxf", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("ring-gasket"))

    await waitFor(() => {
      expect(lastOpenCall()).toBeDefined()
    })
    const props = lastOpenCall()!
    expect(props.parts.length).toBe(1)
    expect(props.parts[0].polygon.holes.length).toBe(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("opens the dialog with 1 part and 4 holes for bracket-with-bolt-holes.dxf; confirm forwards a 4-hole PolygonWithHoles", async () => {
    const onDxfPartConfirmed = vi.fn()
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={onDxfPartConfirmed} />
    )
    dropFile(container, loadFixture("bracket-with-bolt-holes"))

    await waitFor(() => {
      expect(lastOpenCall()).toBeDefined()
    })
    const props = lastOpenCall()!
    expect(props.parts.length).toBe(1)
    expect(props.parts[0].polygon.holes.length).toBe(4)
    expect(toast.error).not.toHaveBeenCalled()

    // Drive the confirm callback directly — the stub doesn't render the
    // real button tree, so we invoke the prop the dialog would call
    // after the operator clicks Add Part. The bbox in the fixture is
    // already in inches (rectangle-inch fixtures use INSUNITS=1).
    props.onConfirm({
      partNumber: "bracket-test",
      polygon: props.parts[0].polygon,
      quantity: 1,
      units: "inch",
      sourceFile: "bracket-with-bolt-holes.dxf",
    })

    expect(onDxfPartConfirmed).toHaveBeenCalledTimes(1)
    const part = onDxfPartConfirmed.mock.calls[0][0]
    expect(part.polygon.holes.length).toBe(4)
  })
})
