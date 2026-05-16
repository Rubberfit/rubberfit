/**
 * Component test for the SVG branch of CutListUpload.
 *
 * Pins:
 *   - Rect + circle SVG -> dialog opens with 1 part, 1 hole.
 *   - Multi-path SVG -> dialog opens with 2 parts, each with 1 hole.
 *   - SVG with only a <text> element -> dialog does not open; targeted
 *     toast surfaces.
 *   - Malformed SVG XML -> SvgParseError mapped to a friendly toast.
 *   - Confirm forwards the SvgImportedPart through `onSvgPartConfirmed`,
 *     never through the DXF callback even when both are wired.
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

interface SvgDialogProps {
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
const mockSvgDialog = vi.hoisted(() => vi.fn((_props: SvgDialogProps) => null))
vi.mock("@/app/dashboard/cutting-engine/_components/svg-review-dialog", () => ({
  __esModule: true,
  default: mockSvgDialog,
}))

const mockDxfDialog = vi.hoisted(() => vi.fn(() => null))
vi.mock("@/app/dashboard/cutting-engine/_components/dxf-review-dialog", () => ({
  __esModule: true,
  default: mockDxfDialog,
}))

vi.mock("@/app/dashboard/cutting-engine/_components/upload-review-dialog", () => ({
  __esModule: true,
  default: () => null,
}))

import CutListUpload from "@/app/dashboard/cutting-engine/_components/cut-list-upload"

function loadSvgFixture(name: string): File {
  const text = readFileSync(resolve("tests/fixtures/svg", `${name}.svg`), "utf8")
  return new File([text], `${name}.svg`, { type: "image/svg+xml" })
}

function dropFile(container: HTMLElement, file: File) {
  const dropzone = container.querySelector<HTMLDivElement>('[data-testid="upload-dropzone"]')
  if (!dropzone) throw new Error("dropzone not found")
  fireEvent.drop(dropzone, { dataTransfer: { files: [file] } })
}

function lastOpenSvgCall(): SvgDialogProps | undefined {
  for (let i = mockSvgDialog.mock.calls.length - 1; i >= 0; i--) {
    const props = mockSvgDialog.mock.calls[i][0]
    if (props?.open === true) return props
  }
  return undefined
}

describe("CutListUpload — SVG branch", () => {
  beforeEach(() => {
    toast.error.mockClear()
    toast.success.mockClear()
    mockSvgDialog.mockClear()
    mockDxfDialog.mockClear()
  })

  it("opens the SVG review dialog with 1 part and 1 hole for rect-with-hole.svg", async () => {
    const { container } = render(
      <CutListUpload
        onPartsConfirmed={vi.fn()}
        onDxfPartConfirmed={vi.fn()}
        onSvgPartConfirmed={vi.fn()}
      />
    )
    dropFile(container, loadSvgFixture("rect-with-hole"))

    await waitFor(() => {
      expect(lastOpenSvgCall()).toBeDefined()
    })
    const props = lastOpenSvgCall()
    if (!props) throw new Error("SVG dialog did not open")
    expect(props.parts.length).toBe(1)
    expect(props.parts[0].polygon.holes.length).toBe(1)
    expect(props.detectedUnits).toBe("mm")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("opens with 2 parts (1 hole each) for multi-path.svg", async () => {
    const { container } = render(
      <CutListUpload
        onPartsConfirmed={vi.fn()}
        onDxfPartConfirmed={vi.fn()}
        onSvgPartConfirmed={vi.fn()}
      />
    )
    dropFile(container, loadSvgFixture("multi-path"))

    await waitFor(() => {
      expect(lastOpenSvgCall()).toBeDefined()
    })
    const props = lastOpenSvgCall()
    if (!props) throw new Error("SVG dialog did not open")
    expect(props.parts.length).toBe(2)
    for (const part of props.parts) {
      expect(part.polygon.holes.length).toBe(1)
    }
  })

  it("surfaces 'No closed-loop part found' toast for an SVG with only text", async () => {
    const { container } = render(
      <CutListUpload
        onPartsConfirmed={vi.fn()}
        onDxfPartConfirmed={vi.fn()}
        onSvgPartConfirmed={vi.fn()}
      />
    )
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>hi</text></svg>'
    const file = new File([text], "text-only.svg", { type: "image/svg+xml" })
    dropFile(container, file)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/text/i))
    expect(lastOpenSvgCall()).toBeUndefined()
  })

  it("maps SvgParseError to a friendly toast for malformed XML", async () => {
    const { container } = render(
      <CutListUpload
        onPartsConfirmed={vi.fn()}
        onDxfPartConfirmed={vi.fn()}
        onSvgPartConfirmed={vi.fn()}
      />
    )
    const file = new File(["<svg><rect></svg"], "broken.svg", { type: "image/svg+xml" })
    dropFile(container, file)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Could not read this SVG/i))
  })

  it("confirm forwards SvgImportedPart through onSvgPartConfirmed, NOT onDxfPartConfirmed", async () => {
    const onSvgPartConfirmed = vi.fn()
    const onDxfPartConfirmed = vi.fn()
    const { container } = render(
      <CutListUpload
        onPartsConfirmed={vi.fn()}
        onDxfPartConfirmed={onDxfPartConfirmed}
        onSvgPartConfirmed={onSvgPartConfirmed}
      />
    )
    dropFile(container, loadSvgFixture("rect-with-hole"))

    await waitFor(() => {
      expect(lastOpenSvgCall()).toBeDefined()
    })
    const props = lastOpenSvgCall()
    if (!props) throw new Error("SVG dialog did not open")

    props.onConfirm({
      partNumber: "svg-test",
      polygon: props.parts[0].polygon,
      quantity: 1,
      units: "mm",
      sourceFile: "rect-with-hole.svg",
    })

    expect(onSvgPartConfirmed).toHaveBeenCalledTimes(1)
    expect(onDxfPartConfirmed).not.toHaveBeenCalled()
  })

  it("shows 'SVG import is not wired' toast when onSvgPartConfirmed prop is absent", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadSvgFixture("rect-with-hole"))

    await waitFor(() => {
      expect(lastOpenSvgCall()).toBeDefined()
    })
    const props = lastOpenSvgCall()
    if (!props) throw new Error("SVG dialog did not open")
    toast.error.mockClear()

    props.onConfirm({
      partNumber: "svg-test",
      polygon: props.parts[0].polygon,
      quantity: 1,
      units: "mm",
      sourceFile: "rect-with-hole.svg",
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not wired/i))
    })
  })
})
