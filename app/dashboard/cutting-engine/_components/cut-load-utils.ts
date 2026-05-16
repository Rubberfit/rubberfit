// Pure helpers for hydrating a `cut_history` record back into the
// cutting-engine surface. Extracted from `page.tsx` so the load
// pipeline (per-template partType, dimensions, quantities) can be
// unit-tested without React.
//
// Issue #126 root cause: `cut_history.part_id` is a scalar — saving
// a mixed-shape cut (e.g. trapezoid + rectangle) only stores the
// primary template's partType, and the load path collapsed every
// template to that single type, dropping the other shapes. The fix
// persists per-template partType inside `layout_json` (additive,
// JSONB, no migration) and reads it back here.

import type {
  CutHistory,
  CutHistoryPartTypeLiteral,
  PartCustomDimensions,
} from "@/src/infrastructure/models/supabase"
import { isSupportedLayoutJsonVersion } from "@/src/infrastructure/models/cut-history-layout"
import { parseDimsFromLabel } from "./cut-planner-utils"
import { coerceLayoutModelArray, type LayoutModel } from "./layout-model"
import type { PartTemplate } from "./preset-template-data"
import type { SupportedPartType } from "./preset-template-data"

const ALLOWED_PART_TYPES: ReadonlySet<CutHistoryPartTypeLiteral> = new Set([
  "rectangle",
  "cylinder",
  "cone",
  "trapezoid",
])

const PART_ID_TO_TYPE: Record<number, SupportedPartType> = {
  1: "rectangle",
  2: "cylinder",
  3: "cone",
  4: "trapezoid",
}

export interface LoadedCutTemplates {
  /** Templates ready to feed `setPresetParts` — one per saved size text. */
  templates: PartTemplate[]
  /** Type of the primary template (used to default the selector tab). */
  primaryPartType: SupportedPartType
  /** Per-template partTypes parallel to `templates`. Always populated. */
  perTemplatePartTypes: SupportedPartType[]
  /** Stored dimension payload, parallel to `templates` (or null when absent). */
  customDimensions: PartCustomDimensions[] | null
  /** Per-template quantities parallel to `templates` (or null when absent). */
  perTemplateQuantities: number[] | null
  /** Original `part_selected_size_text` (used to drive selector matching). */
  sizeTexts: string[]
  /** Frozen layouts from the original pack run, or null for legacy/invalid rows. */
  frozenLayouts: LayoutModel[] | null
}

function partTypeForIndex(
  index: number,
  perTemplatePartTypes: readonly CutHistoryPartTypeLiteral[] | null,
  fallback: SupportedPartType
): SupportedPartType {
  const candidate = perTemplatePartTypes?.[index]
  if (candidate && ALLOWED_PART_TYPES.has(candidate)) return candidate
  return fallback
}

/**
 * Extract the per-template partTypes array from `layout_json` when it
 * is an auto-snapshot AND every entry is a recognised partType. Returns
 * null otherwise so callers fall back to the scalar `cut.part_id`.
 */
export function extractPerTemplatePartTypes(
  cut: Pick<CutHistory, "layout_json">
): CutHistoryPartTypeLiteral[] | null {
  const layout = cut.layout_json
  if (!layout || layout.kind !== "auto") return null
  const raw = layout.perTemplatePartTypes
  if (!Array.isArray(raw) || raw.length === 0) return null
  // Runtime guard — JSONB is unvalidated, so any unknown entry forces a
  // fallback to legacy behaviour rather than mis-typing a template.
  if (!raw.every((entry) => ALLOWED_PART_TYPES.has(entry))) return null
  return raw
}

export function extractFrozenLayouts(cut: Pick<CutHistory, "layout_json">): LayoutModel[] | null {
  const layout = cut.layout_json
  if (!layout || layout.kind !== "auto") return null
  // Version fence: refuse to render envelopes whose schema this build
  // doesn't recognise. The tolerant coercer below would happily back-fill
  // defaults for a v3+ row, but a future schema may add load-bearing
  // fields whose absence would silently degrade the layout. Better to
  // surface "saved layout unavailable" than to render a wrong picture.
  if (!isSupportedLayoutJsonVersion(layout.version)) return null
  // Use the tolerant coercer instead of the strict guard — the JSONB
  // blob may have been written by an older `LayoutModel` shape and we
  // never want a missing/extra optional field to wipe out an entire
  // saved cut. The coercer back-fills defaults so the visualizer can
  // still render the geometry that IS present.
  return coerceLayoutModelArray(layout.layouts)
}

/**
 * Build the templates that hydrate the cutting engine when an operator
 * loads a recorded cut. Pure — no React state, no toasts. The page
 * handler invokes this then dispatches state updates with the result.
 */
export function buildTemplatesFromCutRecord(cut: CutHistory): LoadedCutTemplates {
  const fallbackPartType = PART_ID_TO_TYPE[cut.part_id] ?? "rectangle"
  const perTemplatePartTypesRaw = extractPerTemplatePartTypes(cut)
  const frozenLayouts = extractFrozenLayouts(cut)

  const sizeTexts = cut.part_selected_size_text ?? []
  const sizeLabels = cut.part_selected_label ?? []
  const storedDims = cut.part_custom_dimensions

  const layoutAuto = cut.layout_json?.kind === "auto" ? cut.layout_json : null
  const storedQtys = layoutAuto?.perTemplateQuantities ?? null

  const resolveDims = (
    label: string,
    i: number,
    partType: SupportedPartType
  ): Partial<PartTemplate> => {
    if (storedDims && storedDims[i]) {
      const d: PartCustomDimensions = storedDims[i]
      return {
        ...(d.width !== undefined && { width: d.width }),
        ...(d.length !== undefined && { length: d.length }),
        ...(d.diameter !== undefined && { diameter: d.diameter }),
        ...(d.height !== undefined && { height: d.height }),
        ...(d.topWidth !== undefined && { topWidth: d.topWidth }),
        ...(d.bottomWidth !== undefined && { bottomWidth: d.bottomWidth }),
        ...(d.innerRadius !== undefined && { innerRadius: d.innerRadius }),
        ...(d.outerRadius !== undefined && { outerRadius: d.outerRadius }),
        ...(d.arcDegrees !== undefined && { arcDegrees: d.arcDegrees }),
      }
    }
    // Label-only fallback (older rows without `part_custom_dimensions`).
    // Pass per-index partType so the regex matches the right shape.
    return parseDimsFromLabel(
      partType,
      label,
      i === 0 ? cut.part_custom_width : null,
      i === 0 ? cut.part_custom_height : null
    )
  }

  const quantityFor = (i: number): number => {
    if (storedQtys && Number.isFinite(storedQtys[i])) return storedQtys[i]
    return cut.cut_amount
  }

  const perTemplatePartTypes: SupportedPartType[] =
    sizeTexts.length > 0
      ? sizeTexts.map((_label, i) => partTypeForIndex(i, perTemplatePartTypesRaw, fallbackPartType))
      : [fallbackPartType]

  const templates: PartTemplate[] =
    sizeTexts.length > 0
      ? sizeTexts.map((label, i) => {
          const partType = perTemplatePartTypes[i]
          return {
            id: `loaded-${cut.id}-${i}`,
            partType,
            label,
            summary: sizeLabels[i] ?? label,
            quantity: quantityFor(i),
            category: "custom" as const,
            isCustom: true,
            ...resolveDims(label, i, partType),
          }
        })
      : [
          {
            id: `loaded-${cut.id}-0`,
            partType: fallbackPartType,
            label: `${cut.cut_width}" × ${cut.cut_length}"`,
            summary: "Loaded cut",
            quantity: quantityFor(0),
            category: "custom" as const,
            isCustom: true,
            width: cut.part_custom_width ?? cut.cut_width,
            length: cut.part_custom_height ?? cut.cut_length,
          },
        ]

  return {
    templates,
    primaryPartType: fallbackPartType,
    perTemplatePartTypes,
    customDimensions: storedDims ?? null,
    perTemplateQuantities: storedQtys ?? null,
    sizeTexts,
    frozenLayouts,
  }
}
