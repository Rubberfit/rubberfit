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
 *
 * ## Schema versioning
 *
 * The `version` field is a forward-compat marker:
 *
 *   - `1` — Single-contour parts (`PlacedPart.polygon: Point2D[]`, no holes).
 *     Saved by writers prior to the gasket-cutting PR 0 series.
 *   - `2` — Polygon-with-holes capable. `PlacedPart.holes?: Point2D[][]`
 *     sibling field MAY be present on each part. A v2 row with no
 *     hole-bearing parts is structurally identical to v1. Introduced
 *     2026-05-15 (PR 0c) ahead of CAD import (PR A/B) and gasket
 *     primitives (PR C).
 *
 * Readers MUST accept both `1` and `2` and lift v1 rows by treating
 * absent `holes` as `[]`. New writers stamp `CURRENT_LAYOUT_JSON_VERSION`
 * (== 2). Bumping requires updating both the writer and the reader
 * compat fence (`isSupportedLayoutJsonVersion`).
 */
export type CutHistoryLayoutJson = CutHistoryLayoutJsonManual | CutHistoryLayoutJsonAuto

/**
 * Version stamped on every fresh write. Bumped to 2 in PR 0c to mark
 * envelopes whose `PlacedPart.polygon` lane may carry sibling `holes`
 * loops (gasket rings, full-face bolt circles, CAD-imported geometry).
 */
export const CURRENT_LAYOUT_JSON_VERSION = 2 as const

/**
 * Set of versions readers accept. Widen this when the schema changes;
 * narrow it only after a data migration retires older rows. Rows whose
 * version is outside this set should be treated as unreadable (rendered
 * as a "saved layout unavailable" placeholder rather than crashing).
 *
 * Typed as `ReadonlySet<1 | 2>` (not `<number>`) so that widening the set
 * without widening the literal version unions is a compile error — the
 * `isSupportedLayoutJsonVersion` predicate's return type stays honest.
 */
const SUPPORTED_LAYOUT_JSON_VERSIONS: ReadonlySet<1 | 2> = new Set([1, 2])

/**
 * Accept v1 + v2 envelopes AND envelopes where `version` is absent
 * entirely. The `version` field was introduced 2026-04-24 (#112); any
 * `cut_history.layout_json` row written before that commit has
 * `version: undefined` and must still load — refusing legacy rows
 * would silently break the history page's PDF-regen path for anyone
 * with a pre-April cut. Treating absent version as implicit v1
 * preserves that contract.
 */
export function isSupportedLayoutJsonVersion(value: unknown): value is 1 | 2 | undefined {
  if (value === undefined) return true
  return (
    typeof value === "number" &&
    (value === 1 || value === 2) &&
    SUPPORTED_LAYOUT_JSON_VERSIONS.has(value)
  )
}

export interface CutHistoryLayoutJsonManual {
  version: 1 | 2
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
    /**
     * Saw-blade kerf width in inches. Optional for back-compat with rows
     * saved before the field existed — those rows are loaded with the
     * UI's default kerf (1/8"). New rows always serialize the user's
     * kerf so reload preserves it.
     */
    kerf?: number
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
  version: 1 | 2
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
