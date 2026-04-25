/**
 * selection-presets.ts
 *
 * Named selection presets — localStorage persistence, types, and template
 * resolution helpers shared between use-preset-state.ts and page.tsx.
 */
import { getLocalStorageValue, setLocalStorageValue } from "@/app/lib/local-storage.client"
import type { SupportedPartType, PartTemplate, TemplateCategory } from "./preset-template-data"
import { PART_TEMPLATES } from "./preset-template-data"

// ── Storage key ───────────────────────────────────────────────────────────────

export const SELECTION_PRESETS_KEY = "rubberfit.cut-planner.selection-presets.v1"

// ── Types ─────────────────────────────────────────────────────────────────────

/** Dimension data for matching / constructing templates. Mirrors PartCustomDimensions
 *  from the infrastructure layer — kept local to avoid cross-layer coupling. */
export interface DimensionSet {
  width?: number
  length?: number
  diameter?: number
  height?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
}

/** Snapshot of a single selected template, stored inside a SelectionPreset. */
export interface PresetTemplateSnapshot {
  id: string
  partType: SupportedPartType
  label: string
  summary: string
  category: TemplateCategory
  quantity: number
  isCustom?: boolean
  width?: number
  length?: number
  diameter?: number
  height?: number
  topWidth?: number
  bottomWidth?: number
  innerRadius?: number
  outerRadius?: number
  arcDegrees?: number
}

/** A named, persisted multi-part selection preset. */
export interface SelectionPreset {
  id: string
  name: string
  createdAt: string
  templates: PresetTemplateSnapshot[]
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadSelectionPresets(): SelectionPreset[] {
  const raw = getLocalStorageValue(SELECTION_PRESETS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as SelectionPreset[]
  } catch (_err) {
    return []
  }
}

export function saveSelectionPresets(presets: SelectionPreset[]): void {
  setLocalStorageValue(SELECTION_PRESETS_KEY, JSON.stringify(presets))
}

// ── Template resolution helpers ───────────────────────────────────────────────

/** Returns the first template whose dimensions exactly match the stored dimension set. */
export function findMatchingTemplate(
  templates: PartTemplate[],
  dims: DimensionSet | null | undefined,
  partType: SupportedPartType
): PartTemplate | null {
  if (!dims) return null
  return (
    templates.find((t) => {
      if (t.partType !== partType) return false
      switch (partType) {
        case "rectangle":
          return t.width === dims.width && t.length === dims.length
        case "cylinder":
          return t.diameter === dims.diameter && t.height === dims.height
        case "cone":
          return (
            t.innerRadius === dims.innerRadius &&
            t.outerRadius === dims.outerRadius &&
            t.arcDegrees === dims.arcDegrees
          )
        case "trapezoid":
          return (
            t.topWidth === dims.topWidth &&
            t.bottomWidth === dims.bottomWidth &&
            t.height === dims.height
          )
        default:
          return false
      }
    }) ?? null
  )
}

/** Build a PartTemplate directly from stored dimensions — same ID/label format as
 *  buildCustomTemplate() so identical templates deduplicate correctly. */
export function templateFromDims(
  partType: SupportedPartType,
  dims: DimensionSet
): PartTemplate | null {
  switch (partType) {
    case "rectangle": {
      if (dims.width == null || dims.length == null) return null
      return {
        id: `custom-rectangle-${dims.width}-${dims.length}`,
        partType,
        label: `${dims.width}" × ${dims.length}"`,
        summary: "Custom rectangular cut",
        quantity: 1,
        category: "custom",
        isCustom: true,
        width: dims.width,
        length: dims.length,
      }
    }
    case "cylinder": {
      if (dims.diameter == null || dims.height == null) return null
      return {
        id: `custom-cylinder-${dims.diameter}-${dims.height}`,
        partType,
        label: `Ø${dims.diameter}" × ${dims.height}"`,
        summary: "Custom cylinder wrap",
        quantity: 1,
        category: "custom",
        isCustom: true,
        diameter: dims.diameter,
        height: dims.height,
      }
    }
    case "cone": {
      if (dims.arcDegrees == null || dims.innerRadius == null || dims.outerRadius == null)
        return null
      return {
        id: `custom-cone-${dims.innerRadius}-${dims.outerRadius}-${dims.arcDegrees}`,
        partType,
        label: `${dims.arcDegrees}° • R${dims.innerRadius}" to R${dims.outerRadius}"`,
        summary: "Custom cone spread",
        quantity: 1,
        category: "custom",
        isCustom: true,
        arcDegrees: dims.arcDegrees,
        innerRadius: dims.innerRadius,
        outerRadius: dims.outerRadius,
      }
    }
    case "trapezoid": {
      if (dims.topWidth == null || dims.bottomWidth == null || dims.height == null) return null
      return {
        id: `custom-trapezoid-${dims.topWidth}-${dims.bottomWidth}-${dims.height}`,
        partType,
        label: `${dims.topWidth}" / ${dims.bottomWidth}" × ${dims.height}"`,
        summary: "Custom hopper panel",
        quantity: 1,
        category: "custom",
        isCustom: true,
        topWidth: dims.topWidth,
        bottomWidth: dims.bottomWidth,
        height: dims.height,
      }
    }
    default:
      return null
  }
}

/** Returns all built-in PART_TEMPLATES for a given part type. */
export function getBuiltinTemplatesForType(partType: SupportedPartType): PartTemplate[] {
  return PART_TEMPLATES.filter((t) => t.partType === partType)
}
