import { useEffect, useMemo, useRef, useState } from "react"
import {
  getLocalStorageValue,
  removeLocalStorageValue,
  setLocalStorageValue,
} from "@/app/lib/local-storage.client"

import type {
  PartTemplate,
  CustomPartDrafts,
  CustomTemplateMap,
  SupportedPartType,
  TemplateCategory,
} from "./preset-template-data"
import {
  PART_OPTIONS,
  PART_TEMPLATES,
  DEFAULT_CUSTOM_DRAFTS,
  EMPTY_CUSTOM_TEMPLATES,
  CUSTOM_TEMPLATE_STORAGE_KEY,
} from "./preset-template-data"
import { buildCustomTemplate, templateToDraft, getTemplateAreaSqFt } from "./preset-utils"

/** Mirrors PartCustomDimensions from the infrastructure layer — kept local to
 *  avoid coupling this component file to the database model. */
interface DimensionSet {
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

export interface LoadedSelection {
  /** Part type tab to switch to */
  partType: SupportedPartType
  /** Labels from part_selected_size_text — used to match PART_TEMPLATES by label */
  labels: string[]
  /** Increment to force the effect to re-run even when partType + labels are identical */
  nonce: number
  /**
   * Explicit per-template dimension data from part_custom_dimensions.
   * Legacy fallback: only used when prebuiltTemplates is absent or empty.
   */
  customDimensions?: DimensionSet[]
  /**
   * Fully-constructed PartTemplates for every size text that was recorded with
   * the cut.  The selector matches built-in presets by label first; anything
   * unmatched is created as a custom template from this array and auto-checked.
   * Index 0 also pre-fills the custom-size form so the user can inspect / tweak
   * it and optionally save it as a permanent preset.
   */
  prebuiltTemplates?: PartTemplate[]
}

/** Build a PartTemplate directly from stored dimensions — same ID/label
 *  format as buildCustomTemplate() so identical templates deduplicate. */
function templateFromDims(
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
      if (dims.arcDegrees == null || dims.innerRadius == null || dims.outerRadius == null) return null
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

export function usePresetState(
  onApply?: (templates: PartTemplate[]) => void,
  loadedSelection?: LoadedSelection | null
) {
  const [selectedPart, setSelectedPart] = useState<SupportedPartType>("rectangle")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  /** When true the next onApply call is skipped (used when no preset match exists). */
  const suppressNextApplyRef = useRef(false)
  const [filter, setFilter] = useState<"all" | TemplateCategory>("all")
  const [customDrafts, setCustomDrafts] = useState<CustomPartDrafts>(DEFAULT_CUSTOM_DRAFTS)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateMap>(EMPTY_CUSTOM_TEMPLATES)
  const [nextCustomId, setNextCustomId] = useState(1)
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)

  useEffect(() => {
    const raw = getLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Partial<CustomTemplateMap>
      const hydrated: CustomTemplateMap = {
        rectangle: Array.isArray(parsed.rectangle) ? parsed.rectangle : [],
        cylinder: Array.isArray(parsed.cylinder) ? parsed.cylinder : [],
        cone: Array.isArray(parsed.cone) ? parsed.cone : [],
        trapezoid: Array.isArray(parsed.trapezoid) ? parsed.trapezoid : [],
      }

      queueMicrotask(() => {
        setCustomTemplates(hydrated)

        const maxId = Object.values(hydrated)
          .flat()
          .reduce((highest, template) => {
            const match = template.id.match(/custom-[a-z-]+-(\d+)$/)
            const numericId = match ? Number.parseInt(match[1] ?? "0", 10) : 0
            return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest
          }, 0)

        setNextCustomId(maxId + 1)
      })
    } catch (_error) {
      removeLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    setLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(customTemplates))
  }, [customTemplates])

  const sizeOptions = useMemo(
    () => [
      ...PART_TEMPLATES.filter((template) => template.partType === selectedPart),
      ...customTemplates[selectedPart],
    ],
    [customTemplates, selectedPart]
  )

  const availableCategories = useMemo(() => {
    const categories = new Set<TemplateCategory>()
    sizeOptions.forEach((template) => categories.add(template.category))
    return ["all", ...Array.from(categories)] as Array<"all" | TemplateCategory>
  }, [sizeOptions])

  const visible =
    filter === "all" ? sizeOptions : sizeOptions.filter((template) => template.category === filter)

  const selectedTemplates = useMemo(
    () =>
      Array.from(checked)
        .map((id) => sizeOptions.find((template) => template.id === id) ?? null)
        .filter((template): template is PartTemplate => template !== null),
    [checked, sizeOptions]
  )

  const pendingCustomTemplate = useMemo(
    () => buildCustomTemplate(selectedPart, customDrafts),
    [customDrafts, selectedPart]
  )

  const totalArea = selectedTemplates.reduce(
    (acc, template) => acc + getTemplateAreaSqFt(template),
    0
  )

  // Effect: respond to an external load trigger (e.g. loading a recorded cut)
  useEffect(() => {
    if (!loadedSelection) return
    const { partType, labels, customDimensions } = loadedSelection

    setSelectedPart(partType)
    setFilter("all")
    setEditingCustomId(null)

    if (customDimensions && customDimensions.length > 0) {
      // ── Path A: explicit dimension data is available ───────────────────────
      // Build a PartTemplate for every stored dimension entry.
      const newTemplates = customDimensions
        .map((dims) => templateFromDims(partType, dims))
        .filter((t): t is PartTemplate => t !== null)

      if (newTemplates.length === 0) {
        suppressNextApplyRef.current = true
        setChecked(new Set())
        return
      }

      // Merge into customTemplates, skipping IDs that already exist so the
      // user's own saved templates are never duplicated.
      setCustomTemplates((prev) => {
        const existing = prev[partType]
        const existingIds = new Set(existing.map((t) => t.id))
        const toAdd = newTemplates.filter((t) => !existingIds.has(t.id))
        if (toAdd.length === 0) return prev
        return { ...prev, [partType]: [...existing, ...toAdd] }
      })

      // Check every template that was built from the stored dimensions.
      setChecked(new Set(newTemplates.map((t) => t.id)))

      // Pre-fill the custom-size form with index 0's values so the user can
      // inspect / tweak the primary size and optionally save it as a preset.
      const d = customDimensions[0]
      setCustomDrafts((prev) => {
        switch (partType) {
          case "rectangle":
            return { ...prev, rectangle: { width: String(d.width ?? ""), length: String(d.length ?? "") } }
          case "cylinder":
            return { ...prev, cylinder: { diameter: String(d.diameter ?? ""), height: String(d.height ?? "") } }
          case "cone":
            return { ...prev, cone: { innerRadius: String(d.innerRadius ?? ""), outerRadius: String(d.outerRadius ?? ""), arcDegrees: String(d.arcDegrees ?? "") } }
          case "trapezoid":
            return { ...prev, trapezoid: { topWidth: String(d.topWidth ?? ""), bottomWidth: String(d.bottomWidth ?? ""), height: String(d.height ?? "") } }
          default:
            return prev
        }
      })
    } else {
      // ── Path B: no stored dimensions — fall back to label matching ─────────
      const allForType = PART_TEMPLATES.filter((t) => t.partType === partType)
      const matchedIds = new Set(
        allForType.filter((t) => labels.includes(t.label)).map((t) => t.id)
      )
      if (matchedIds.size === 0) {
        // No preset match — suppress the next onApply so we don't wipe caller state
        suppressNextApplyRef.current = true
      }
      setChecked(matchedIds)
    }
  }, [loadedSelection])

  useEffect(() => {
    if (suppressNextApplyRef.current) {
      suppressNextApplyRef.current = false
      return
    }
    onApply?.(selectedTemplates)
  }, [onApply, selectedTemplates])

  const handlePartChange = (partType: SupportedPartType) => {
    setSelectedPart(partType)
    setChecked(new Set())
    setFilter("all")
    setEditingCustomId(null)
  }

  const handleToggle = (templateId: string) => {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setChecked(new Set(sizeOptions.map((template) => template.id)))
  }

  const handleClearAll = () => {
    setChecked(new Set())
  }

  const customDraft = customDrafts[selectedPart]
  const selectedPartLabel =
    PART_OPTIONS.find((part) => part.partType === selectedPart)?.label ?? "Part"
  const savedCustomCount = customTemplates[selectedPart].length

  const handleAddCustomSize = () => {
    if (!pendingCustomTemplate) return

    if (editingCustomId) {
      const customTemplate: PartTemplate = {
        ...pendingCustomTemplate,
        id: editingCustomId,
      }

      setCustomTemplates((previous) => ({
        ...previous,
        [selectedPart]: previous[selectedPart].map((template) =>
          template.id === editingCustomId ? customTemplate : template
        ),
      }))
      setEditingCustomId(null)
    } else {
      const id = `custom-${selectedPart}-${nextCustomId}`
      const customTemplate: PartTemplate = {
        ...pendingCustomTemplate,
        id,
      }

      setCustomTemplates((previous) => ({
        ...previous,
        [selectedPart]: [...previous[selectedPart], customTemplate],
      }))
      setChecked((previous) => {
        const next = new Set(previous)
        next.add(id)
        return next
      })
      setNextCustomId((previous) => previous + 1)
    }

    setFilter("all")
    setCustomDrafts((previous) => ({
      ...previous,
      [selectedPart]: DEFAULT_CUSTOM_DRAFTS[selectedPart],
    }))
  }

  const editCustomTemplate = (template: PartTemplate) => {
    setEditingCustomId(template.id)
    setFilter("all")
    setCustomDrafts((previous) => ({
      ...previous,
      [selectedPart]: templateToDraft(template),
    }))
  }

  const removeCustomTemplate = (templateId: string) => {
    setCustomTemplates((previous) => ({
      ...previous,
      [selectedPart]: previous[selectedPart].filter((template) => template.id !== templateId),
    }))
    setChecked((previous) => {
      const next = new Set(previous)
      next.delete(templateId)
      return next
    })
    if (editingCustomId === templateId) {
      setEditingCustomId(null)
      setCustomDrafts((previous) => ({
        ...previous,
        [selectedPart]: DEFAULT_CUSTOM_DRAFTS[selectedPart],
      }))
    }
  }

  return {
    selectedPart,
    checked,
    filter,
    setFilter,
    customDrafts,
    setCustomDrafts,
    editingCustomId,
    setEditingCustomId,
    availableCategories,
    visible,
    selectedTemplates,
    pendingCustomTemplate,
    totalArea,
    customDraft,
    selectedPartLabel,
    savedCustomCount,
    handlePartChange,
    handleToggle,
    handleSelectAll,
    handleClearAll,
    handleAddCustomSize,
    editCustomTemplate,
    removeCustomTemplate,
  }
}
