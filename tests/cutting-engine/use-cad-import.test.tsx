/**
 * Smoke test for the useCadImport hook (PR C Commit 6).
 *
 * Pins:
 *   - confirmDxf calls onAdd with a PartTemplate carrying
 *     partType: "polygon", units converted mm → inches, and
 *     identity fields (id, label, summary, partNumber, sourceFile).
 *   - confirmSvg does the same for an SvgImportedPart.
 *   - The id prefix encodes the source: dxf-* vs svg-*.
 *   - cancelDxf / cancelSvg clear the review state (set to null).
 */
import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { useCadImport } from "@/app/dashboard/cutting-engine/_components/use-cad-import"
import type { DxfImportedPart } from "@/src/application/cad/dxf-types"
import type { SvgImportedPart } from "@/src/application/cad/svg-types"

// jsdom-friendly minimal DxfImportedPart / SvgImportedPart fixtures —
// the hook only reads partNumber / quantity / sourceFile / units /
// polygon, so we can mock the rest as empty.
function dxfPart(units: "inch" | "mm" = "inch"): DxfImportedPart {
  return {
    partNumber: "DXF-001",
    sourceFile: "ring.dxf",
    units,
    quantity: 2,
    polygon: {
      outer: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      holes: [
        [
          { x: 2, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 8 },
          { x: 2, y: 8 },
        ],
      ],
    },
    layer: "0",
    sourceType: "dxf",
  } as unknown as DxfImportedPart
}

function svgPart(units: "inch" | "mm" = "mm"): SvgImportedPart {
  return {
    partNumber: "SVG-001",
    sourceFile: "gasket.svg",
    units,
    quantity: 1,
    polygon: {
      outer: [
        { x: 0, y: 0 },
        { x: 25.4, y: 0 },
        { x: 25.4, y: 25.4 },
        { x: 0, y: 25.4 },
      ],
      holes: [],
    },
    sourceType: "svg",
  } as unknown as SvgImportedPart
}

describe("useCadImport", () => {
  it("confirmDxf emits a PartTemplate with partType: 'polygon' and dxf id prefix", () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useCadImport({ onAdd }))
    act(() => {
      result.current.confirmDxf(dxfPart("inch"))
    })
    expect(onAdd).toHaveBeenCalledTimes(1)
    const tmpl = onAdd.mock.calls[0][0]
    expect(tmpl.partType).toBe("polygon")
    expect(tmpl.partNumber).toBe("DXF-001")
    expect(tmpl.sourceFile).toBe("ring.dxf")
    expect(tmpl.id).toMatch(/^dxf-/)
    expect(tmpl.summary).toContain("DXF")
    expect(tmpl.polygon.outer).toHaveLength(4)
    expect(tmpl.polygon.holes).toHaveLength(1)
  })

  it("confirmSvg with mm units converts the polygon to inches", () => {
    const onAdd = vi.fn()
    const { result } = renderHook(() => useCadImport({ onAdd }))
    act(() => {
      result.current.confirmSvg(svgPart("mm"))
    })
    const tmpl = onAdd.mock.calls[0][0]
    // 25.4mm → 1.0″ within float epsilon.
    const outerXs = tmpl.polygon.outer.map((p: { x: number }) => p.x)
    expect(Math.max(...outerXs)).toBeCloseTo(1.0, 5)
    expect(tmpl.id).toMatch(/^svg-/)
  })

  it("cancelDxf clears the dxfReview state (null)", () => {
    const { result } = renderHook(() => useCadImport({ onAdd: vi.fn() }))
    act(() => result.current.cancelDxf())
    expect(result.current.dxfReview).toBeNull()
  })

  it("cancelSvg clears the svgReview state (null)", () => {
    const { result } = renderHook(() => useCadImport({ onAdd: vi.fn() }))
    act(() => result.current.cancelSvg())
    expect(result.current.svgReview).toBeNull()
  })
})
