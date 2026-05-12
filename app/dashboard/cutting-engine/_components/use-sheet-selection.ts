"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { LayoutModel } from "./layout-model"

export interface UseSheetSelectionResult {
  selectedId: string | null
  selectPart: (id: string | null) => void
}

/**
 * Sheet-selection state for the Auto-nest SVG renderer (Phase 5 PR 4).
 *
 * Holds a single selected `PlacedPart.id` across all sheets in a pack
 * result. When `selectedId` is not present in the current `layouts`
 * (e.g. after a re-pack that reshuffles LBF/LNS instance ids), the
 * hook BOTH returns `null` AND clears the stored state.
 *
 * The derived-only approach (return `null` while state still holds
 * the stale id) had a silent bug: re-selecting the same id after a
 * re-pack would be a `setState` no-op because React bails out on
 * `Object.is(prev, next)`. The cleanup effect below makes the stored
 * state authoritative.
 *
 * Hover state is intentionally NOT held here. Hover is handled via
 * CSS `:hover` at the SVG level so 100+ parts do not each trigger a
 * React state update on `mouseenter` / `mouseleave`.
 */
export function useSheetSelection(layouts: LayoutModel[] | undefined): UseSheetSelectionResult {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectionStillValid = useMemo(() => {
    if (!selectedId || !layouts) return false
    return layouts.some((layout) => layout.parts.some((p) => p.id === selectedId))
  }, [selectedId, layouts])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    if (selectedId !== null && !selectionStillValid) {
      setSelectedId(null)
    }
  }, [selectedId, selectionStillValid])

  const selectPart = useCallback((id: string | null) => {
    setSelectedId(id)
  }, [])

  return {
    selectedId: selectionStillValid ? selectedId : null,
    selectPart,
  }
}
