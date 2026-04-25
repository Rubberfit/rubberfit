/**
 * Canvas / layout snapshot attached to a `cut_history.layout_json` row.
 * Discriminated on `kind`:
 *
 *   - `"manual"` (default when absent) — Free-roam CAD placements.
 *     Carries everything needed to rehydrate the canvas: placements
 *     (with x/y/rotation), the full parts queue, and the stock config.
 *
 *   - `"auto"` — Auto-nest output. Stores per-template quantities (which
 *     `cut_history.cut_amount`'s scalar form loses) plus an optional
 *     frozen `layouts` array so a multi-sheet reopen can skip the re-pack
 *     and render the original geometry. If `layouts` is absent, the
 *     re-pack fallback uses `perTemplateQuantities` for correct inputs.
 *
 * Lives outside `supabase.ts` because the JSONB blob is a client-side
 * contract owned by the cutting-engine surface, not a Supabase-generated
 * row type. Server stores it verbatim and never validates the shape.
 */
export type CutHistoryLayoutJson = CutHistoryLayoutJsonManual | CutHistoryLayoutJsonAuto

export interface CutHistoryLayoutJsonManual {
  version: 1
  /** Absent on pre-kind rows — implicitly manual. */
  kind?: "manual"
  placements: Array<{
    id: string
    templateId: string
    x: number
    y: number
    rotationRad: number
  }>
  parts: unknown[]
  stock: {
    width: number
    length: number
    thickness: number
    material?: string
    costPerSqft?: number | null
  }
}

/**
 * Part types persisted in `layout_json.perTemplatePartTypes`. Mirrors
 * `SupportedPartType` in the cutting-engine UI but stays as a local
 * literal union here to preserve the clean-architecture boundary
 * (infra must not import from `app/`). The load path validates each
 * entry against this set before applying it.
 */
export type CutHistoryPartTypeLiteral = "rectangle" | "cylinder" | "cone" | "trapezoid"

export interface CutHistoryLayoutJsonAuto {
  version: 1
  kind: "auto"
  /**
   * Per-template quantities in the same order as
   * `cut_history.part_selected_size_text`. Restores the exact pack input
   * that the scalar `cut_amount` can't represent for multi-template cuts.
   */
  perTemplateQuantities: number[]
  /**
   * Per-template part types in the same order as `perTemplateQuantities`
   * and `cut_history.part_selected_size_text`. Added for issue #126: the
   * scalar `cut_history.part_id` cannot encode mixed-shape cuts
   * (e.g. trapezoid + rectangle), so without this field the load path
   * collapses every template to a single partType. Optional for back-compat
   * with rows saved before the fix — those rows fall back to
   * `cut_history.part_id` for every template (legacy behavior).
   */
  perTemplatePartTypes?: CutHistoryPartTypeLiteral[]
  /**
   * Frozen post-rotation layouts from the original pack run. When present,
   * reopening the cut bypasses the re-pack so the operator sees the same
   * multi-sheet split as the original session. Opaque `LayoutModel[]` —
   * the client is sole reader / writer.
   */
  layouts?: unknown[]
}
