/**
 * Component test for the DXF branch of CutListUpload.
 *
 * Pins:
 *   - Dropping a multi-loop DXF surfaces a toast.error and never
 *     opens the review dialog (multi-part import is PR2).
 *   - Dropping a bulged-polyline DXF surfaces the bulge-specific
 *     toast and never opens the review dialog.
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
}))
vi.mock("sonner", () => ({ toast }))

vi.mock("@/src/infrastructure/services/visionExtractionService", () => ({
  extractFromImage: vi.fn(),
}))

vi.mock("@/app/dashboard/cutting-engine/_components/spreadsheet-parser", () => ({
  parseSpreadsheet: vi.fn(),
}))

// Stub the DXF review dialog so we can observe its `open` prop without
// needing to render the full Radix dialog tree (happy-dom Portal quirks).
const mockDialog = vi.hoisted(() => vi.fn((_props: { open: boolean }) => null))
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
  const dropzone = container.querySelector("div.rounded-lg.border-2") as HTMLDivElement
  if (!dropzone) throw new Error("dropzone not found")
  fireEvent.drop(dropzone, {
    dataTransfer: { files: [file] },
  })
}

describe("CutListUpload — DXF branch", () => {
  beforeEach(() => {
    toast.error.mockClear()
    toast.success.mockClear()
    mockDialog.mockClear()
  })

  it("rejects multi-loop DXF with toast and never opens the review dialog", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("two-rectangles"))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/2 closed parts/))
    })

    const everOpened = mockDialog.mock.calls.some((call) => call[0]?.open === true)
    expect(everOpened).toBe(false)
  })

  it("rejects bulged-polyline DXF with bulge-specific toast", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("lwpolyline-with-bulge"))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/arc-bulged|flatten/i))
    })

    const everOpened = mockDialog.mock.calls.some((call) => call[0]?.open === true)
    expect(everOpened).toBe(false)
  })

  it("opens the DXF review dialog for a single-loop closed-LWPOLYLINE DXF", async () => {
    const { container } = render(
      <CutListUpload onPartsConfirmed={vi.fn()} onDxfPartConfirmed={vi.fn()} />
    )
    dropFile(container, loadFixture("rectangle"))

    await waitFor(() => {
      const opened = mockDialog.mock.calls.some((call) => call[0]?.open === true)
      expect(opened).toBe(true)
    })
    expect(toast.error).not.toHaveBeenCalled()
  })
})
