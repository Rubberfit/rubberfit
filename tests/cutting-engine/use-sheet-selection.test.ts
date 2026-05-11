/**
 * Phase 5 PR 4 — selection hook semantics.
 *
 * Pins:
 *   - `selectPart(id)` updates `selectedId`
 *   - `selectPart(null)` clears
 *   - Stale ids (id not present in current layouts) are reported as null
 *   - Re-running a pack that drops the previously selected part
 *     auto-clears the visible selection (derived state, not effect)
 */
import { describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useSheetSelection } from "@/app/dashboard/cutting-engine/_components/use-sheet-selection"
import type {
  LayoutModel,
  PlacedPart,
} from "@/app/dashboard/cutting-engine/_components/layout-model"

function makePart(id: string, label: string): PlacedPart {
  return {
    id,
    shapeId: id,
    label,
    renderShape: "rect",
    specIndex: 0,
    x: 0,
    y: 0,
    rotationRad: 0,
    width: 12,
    height: 18,
  }
}

function makeLayout(parts: PlacedPart[]): LayoutModel {
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

describe("useSheetSelection", () => {
  it("defaults to null", () => {
    const { result } = renderHook(() => useSheetSelection([makeLayout([makePart("p-1", "A")])]))
    expect(result.current.selectedId).toBeNull()
  })

  it("selects a part when given a present id", () => {
    const layouts = [makeLayout([makePart("p-1", "A"), makePart("p-2", "B")])]
    const { result } = renderHook(() => useSheetSelection(layouts))
    act(() => result.current.selectPart("p-2"))
    expect(result.current.selectedId).toBe("p-2")
  })

  it("clears on selectPart(null)", () => {
    const layouts = [makeLayout([makePart("p-1", "A")])]
    const { result } = renderHook(() => useSheetSelection(layouts))
    act(() => result.current.selectPart("p-1"))
    expect(result.current.selectedId).toBe("p-1")
    act(() => result.current.selectPart(null))
    expect(result.current.selectedId).toBeNull()
  })

  it("treats a selected id that is absent from layouts as null", () => {
    const layouts = [makeLayout([makePart("p-1", "A")])]
    const { result } = renderHook(() => useSheetSelection(layouts))
    act(() => result.current.selectPart("does-not-exist"))
    expect(result.current.selectedId).toBeNull()
  })

  it("auto-clears the visible selection when a re-pack drops the part", () => {
    const initial = [makeLayout([makePart("p-1", "A"), makePart("p-2", "B")])]
    const { result, rerender } = renderHook(({ layouts }) => useSheetSelection(layouts), {
      initialProps: { layouts: initial },
    })
    act(() => result.current.selectPart("p-2"))
    expect(result.current.selectedId).toBe("p-2")

    // Re-pack — p-2 is gone, the surviving id is "p-1".
    const repacked = [makeLayout([makePart("p-1", "A")])]
    rerender({ layouts: repacked })
    expect(result.current.selectedId).toBeNull()
  })

  it("clears the underlying stored state on re-pack (re-selecting same id works after)", () => {
    // Regression for the silent-state bug: derived-null + stored-stale
    // would cause `setSelectedId("p-2")` to bail out as a no-op the
    // next time around (React.useState's `Object.is` short-circuit).
    const initial = [makeLayout([makePart("p-1", "A"), makePart("p-2", "B")])]
    const { result, rerender } = renderHook(({ layouts }) => useSheetSelection(layouts), {
      initialProps: { layouts: initial },
    })
    act(() => result.current.selectPart("p-2"))
    expect(result.current.selectedId).toBe("p-2")

    // Re-pack — drop p-2.
    rerender({ layouts: [makeLayout([makePart("p-1", "A")])] })
    expect(result.current.selectedId).toBeNull()

    // Re-pack again — p-2 returns. Selecting it must engage.
    rerender({ layouts: [makeLayout([makePart("p-1", "A"), makePart("p-2", "B")])] })
    act(() => result.current.selectPart("p-2"))
    expect(result.current.selectedId).toBe("p-2")
  })

  it("finds the part across multiple sheets", () => {
    const layouts = [makeLayout([makePart("p-1", "A")]), makeLayout([makePart("p-2", "B")])]
    const { result } = renderHook(() => useSheetSelection(layouts))
    act(() => result.current.selectPart("p-2"))
    expect(result.current.selectedId).toBe("p-2")
  })
})
