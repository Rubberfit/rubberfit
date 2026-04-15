import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
  LEGACY_CUSTOM_TEMPLATE_STORAGE_KEY,
} from "./preset-template-data"
import { buildCustomTemplate, templateToDraft, getTemplateAreaSqFt } from "./preset-utils"
import {
  type DimensionSet,
  type SelectionPreset,
  type PresetTemplateSnapshot,
  findMatchingTemplate,
  templateFromDims,
  loadSelectionPresets,
  saveSelectionPresets,
} from "./selection-presets"

// ── Types ─────────────────────────────────────────────────────────────────────

/** One part-type entry in a multi-type loaded selection. */
export interface LoadedSelectionEntry {
  partType: SupportedPartType
  /** Labels from part_selected_size_text — used to match PART_TEMPLATES by label */
  labels: string[]
  /** Explicit per-template dimension data from part_custom_dimensions. */
  customDimensions?: DimensionSet[]
  /** Quantity override per index, parallel to customDimensions / labels. */
  quantityPerIndex?: number[]
}

export interface LoadedSelection {
  /** Primary part type tab to activate — kept for backward compat (= first entry's type). */
  partType: SupportedPartType
  /** Labels for single-type legacy fallback. */
  labels: string[]
  /** Increment to force the effect to re-run even when partType + labels are identical. */
  nonce: number
  /** Explicit dimension data — single-type legacy path. */
  customDimensions?: DimensionSet[]
  /** Fully-constructed PartTemplates (single-type legacy path). */
  prebuiltTemplates?: PartTemplate[]
  /** Quantity overrides for the single-type legacy path, parallel to labels. */
  quantityPerIndex?: number[]
  /** NEW: multi-type entries — when present, supersedes the single-type fields above
   *  for template resolution. `partType` / `labels` are still used as fallbacks. */
  multiTypeEntries?: LoadedSelectionEntry[]
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function hydrateCustomTemplates(
  raw: string
): { hydrated: CustomTemplateMap; maxId: number } | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CustomTemplateMap>
    const hydrated: CustomTemplateMap = {
      rectangle: Array.isArray(parsed.rectangle) ? parsed.rectangle : [],
      cylinder: Array.isArray(parsed.cylinder) ? parsed.cylinder : [],
      cone: Array.isArray(parsed.cone) ? parsed.cone : [],
      trapezoid: Array.isArray(parsed.trapezoid) ? parsed.trapezoid : [],
    }
    const maxId = Object.values(hydrated)
      .flat()
      .reduce((highest, template) => {
        const match = template.id.match(/custom-[a-z-]+-(\d+)$/)
        const numericId = match ? Number.parseInt(match[1] ?? "0", 10) : 0
        return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest
      }, 0)
    return { hydrated, maxId }
  } catch (_error) {
    return null
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

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
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())

  // ── Active selection — unifies external prop + internal preset loads ────────
  const [activeSelection, setActiveSelection] = useState<LoadedSelection | null>(null)

  // ── Selection presets ──────────────────────────────────────────────────────
  const [selectionPresets, setSelectionPresets] = useState<SelectionPreset[]>([])

  // Load persisted custom templates on mount
  useEffect(() => {
    let raw = getLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
    if (!raw) {
      raw = getLocalStorageValue(LEGACY_CUSTOM_TEMPLATE_STORAGE_KEY)
      if (raw) {
        setLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY, raw)
        removeLocalStorageValue(LEGACY_CUSTOM_TEMPLATE_STORAGE_KEY)
      }
    }
    if (!raw) return
    const result = hydrateCustomTemplates(raw)
    if (!result) {
      removeLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
      return
    }
    queueMicrotask(() => {
      setCustomTemplates(result.hydrated)
      setNextCustomId(result.maxId + 1)
    })
  }, [])

  // Persist custom templates whenever they change
  useEffect(() => {
    setLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY, JSON.stringify(customTemplates))
  }, [customTemplates])

  // Load persisted selection presets on mount
  useEffect(() => {
    setSelectionPresets(loadSelectionPresets())
  }, [])

  // Sync external loadedSelection into activeSelection
  useEffect(() => {
    if (loadedSelection) {
      setActiveSelection(loadedSelection)
    }
  }, [loadedSelection])

  // ── Derived state ──────────────────────────────────────────────────────────

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

  const allTemplates = useMemo(
    () => [
      ...PART_TEMPLATES,
      ...customTemplates.rectangle,
      ...customTemplates.cylinder,
      ...customTemplates.cone,
      ...customTemplates.trapezoid,
    ],
    [customTemplates]
  )

  const selectedTemplates = useMemo(
    () =>
      Array.from(checked)
        .map((id) => allTemplates.find((template) => template.id === id) ?? null)
        .filter((template): template is PartTemplate => template !== null)
        .map((template) => ({
          ...template,
          quantity: quantities.get(template.id) ?? template.quantity,
        })),
    [checked, allTemplates, quantities]
  )

  const selectionCounts = useMemo(() => {
    const idToType = new Map(allTemplates.map((t) => [t.id, t.partType]))
    const counts = new Map<string, number>()
    for (const id of checked) {
      const partType = idToType.get(id)
      if (partType) counts.set(partType, (counts.get(partType) ?? 0) + 1)
    }
    return counts
  }, [checked, allTemplates])

  const pendingCustomTemplate = useMemo(
    () => buildCustomTemplate(selectedPart, customDrafts),
    [customDrafts, selectedPart]
  )

  const totalArea = selectedTemplates.reduce(
    (acc, template) => acc + getTemplateAreaSqFt(template),
    0
  )

  // ── Load effect — responds to activeSelection (external prop or preset load) ─

  useEffect(() => {
    if (!activeSelection) return

    // Normalize: build a unified entries list from either multi-type or legacy fields
    const entries: LoadedSelectionEntry[] =
      activeSelection.multiTypeEntries && activeSelection.multiTypeEntries.length > 0
        ? activeSelection.multiTypeEntries
        : [
            {
              partType: activeSelection.partType,
              labels: activeSelection.labels,
              customDimensions: activeSelection.customDimensions,
              quantityPerIndex: activeSelection.quantityPerIndex,
            },
          ]

    setSelectedPart(entries[0]?.partType ?? "rectangle")
    setFilter("all")
    setEditingCustomId(null)

    setCustomTemplates((prev) => {
      const next = { ...prev }
      const allIdsToCheck: string[] = []
      const allQtyOverrides: [string, number][] = []

      for (const entry of entries) {
        const { partType, labels, customDimensions, quantityPerIndex } = entry
        const builtinForType = PART_TEMPLATES.filter((t) => t.partType === partType)
        const existingCustom = next[partType]
        const allForType = [...builtinForType, ...existingCustom]
        const seenIds = new Set(allForType.map((t) => t.id))
        const entryIds: string[] = []
        const toAdd: PartTemplate[] = []

        if (customDimensions && customDimensions.length > 0) {
          for (const dims of customDimensions) {
            const match = findMatchingTemplate(allForType, dims, partType)
            if (match) {
              entryIds.push(match.id)
            } else {
              const newTemplate = templateFromDims(partType, dims)
              if (newTemplate && !seenIds.has(newTemplate.id)) {
                toAdd.push(newTemplate)
                seenIds.add(newTemplate.id)
                allForType.push(newTemplate)
              }
              if (newTemplate) entryIds.push(newTemplate.id)
            }
          }
        } else {
          // Label fallback (legacy records without stored dimensions)
          const matched = allForType
            .filter((t) => labels.includes(t.label))
            .map((t) => t.id)
          entryIds.push(...matched)
        }

        allIdsToCheck.push(...entryIds)

        // Collect quantity overrides
        if (quantityPerIndex) {
          entryIds.forEach((id, i) => {
            const qty = quantityPerIndex[i]
            if (qty !== undefined && qty > 1) {
              allQtyOverrides.push([id, qty])
            }
          })
        }

        if (toAdd.length > 0) {
          next[partType] = [...existingCustom, ...toAdd]
        }
      }

      queueMicrotask(() => {
        if (allIdsToCheck.length === 0) {
          suppressNextApplyRef.current = true
          setChecked(new Set())
          return
        }
        setChecked(new Set(allIdsToCheck))

        if (allQtyOverrides.length > 0) {
          setQuantities(new Map(allQtyOverrides))
        }

        // Pre-fill custom form with first entry's first dimension
        const firstEntry = entries[0]
        if (firstEntry?.customDimensions?.[0]) {
          const d = firstEntry.customDimensions[0]
          const pt = firstEntry.partType
          setCustomDrafts((prev) => {
            switch (pt) {
              case "rectangle":
                return {
                  ...prev,
                  rectangle: { width: String(d.width ?? ""), length: String(d.length ?? "") },
                }
              case "cylinder":
                return {
                  ...prev,
                  cylinder: {
                    diameter: String(d.diameter ?? ""),
                    height: String(d.height ?? ""),
                  },
                }
              case "cone":
                return {
                  ...prev,
                  cone: {
                    innerRadius: String(d.innerRadius ?? ""),
                    outerRadius: String(d.outerRadius ?? ""),
                    arcDegrees: String(d.arcDegrees ?? ""),
                  },
                }
              case "trapezoid":
                return {
                  ...prev,
                  trapezoid: {
                    topWidth: String(d.topWidth ?? ""),
                    bottomWidth: String(d.bottomWidth ?? ""),
                    height: String(d.height ?? ""),
                  },
                }
              default:
                return prev
            }
          })
        }
      })

      return next
    })
  }, [activeSelection])

  // Notify parent when selected templates change
  useEffect(() => {
    if (suppressNextApplyRef.current) {
      suppressNextApplyRef.current = false
      return
    }
    onApply?.(selectedTemplates)
  }, [onApply, selectedTemplates])

  // ── Preset management ──────────────────────────────────────────────────────

  /** Save the current selection (all checked templates + quantities) as a named preset. */
  const saveCurrentAsPreset = useCallback(
    (name: string): boolean => {
      if (!name.trim() || selectedTemplates.length === 0) return false
      const snapshot: PresetTemplateSnapshot[] = selectedTemplates.map((t) => ({
        id: t.id,
        partType: t.partType as SupportedPartType,
        label: t.label,
        summary: t.summary,
        category: t.category,
        quantity: quantities.get(t.id) ?? t.quantity,
        isCustom: t.isCustom,
        width: t.width,
        length: t.length,
        diameter: t.diameter,
        height: t.height,
        topWidth: t.topWidth,
        bottomWidth: t.bottomWidth,
        innerRadius: t.innerRadius,
        outerRadius: t.outerRadius,
        arcDegrees: t.arcDegrees,
      }))
      const newPreset: SelectionPreset = {
        id: `preset-${Date.now()}`,
        name: name.trim(),
        createdAt: new Date().toISOString(),
        templates: snapshot,
      }
      const updated = [...selectionPresets, newPreset]
      setSelectionPresets(updated)
      saveSelectionPresets(updated)
      return true
    },
    [selectedTemplates, quantities, selectionPresets]
  )

  /** Delete a saved preset by ID. */
  const deletePreset = useCallback(
    (presetId: string) => {
      const updated = selectionPresets.filter((p) => p.id !== presetId)
      setSelectionPresets(updated)
      saveSelectionPresets(updated)
    },
    [selectionPresets]
  )

  /** Load a saved preset — restores all part types, sizes, and quantities. */
  const loadPreset = useCallback((preset: SelectionPreset) => {
    // Group template snapshots by part type to build multiTypeEntries
    const byType = new Map<SupportedPartType, PresetTemplateSnapshot[]>()
    for (const t of preset.templates) {
      const arr = byType.get(t.partType) ?? []
      arr.push(t)
      byType.set(t.partType, arr)
    }
    const firstType = preset.templates[0]?.partType ?? "rectangle"

    const multiTypeEntries: LoadedSelectionEntry[] = Array.from(byType.entries()).map(
      ([partType, temps]) => ({
        partType,
        labels: temps.map((t) => t.label),
        customDimensions: temps.map((t) => ({
          width: t.width,
          length: t.length,
          diameter: t.diameter,
          height: t.height,
          topWidth: t.topWidth,
          bottomWidth: t.bottomWidth,
          innerRadius: t.innerRadius,
          outerRadius: t.outerRadius,
          arcDegrees: t.arcDegrees,
        })),
        quantityPerIndex: temps.map((t) => t.quantity),
      })
    )

    setActiveSelection({
      partType: firstType,
      labels: preset.templates.map((t) => t.label),
      nonce: Date.now(),
      multiTypeEntries,
    })
  }, [])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePartChange = (partType: SupportedPartType) => {
    setSelectedPart(partType)
    setFilter("all")
    setEditingCustomId(null)
  }

  const handleQuantityChange = (templateId: string, qty: number) => {
    const clamped = Number.isFinite(qty) ? Math.max(1, Math.min(99, Math.round(qty))) : 1
    setQuantities((previous) => {
      const next = new Map(previous)
      if (clamped <= 1) {
        next.delete(templateId)
      } else {
        next.set(templateId, clamped)
      }
      return next
    })
  }

  const handleToggle = (templateId: string) => {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(templateId)) {
        next.delete(templateId)
        setQuantities((prev) => {
          const nextQ = new Map(prev)
          nextQ.delete(templateId)
          return nextQ
        })
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setChecked((previous) => {
      const next = new Set(previous)
      for (const template of sizeOptions) {
        next.add(template.id)
      }
      return next
    })
  }

  const handleClearAll = () => {
    setChecked(new Set())
    setQuantities(new Map())
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
    quantities,
    selectionCounts,
    // Preset management
    selectionPresets,
    saveCurrentAsPreset,
    deletePreset,
    loadPreset,
    // Handlers
    handlePartChange,
    handleToggle,
    handleQuantityChange,
    handleSelectAll,
    handleClearAll,
    handleAddCustomSize,
    editCustomTemplate,
    removeCustomTemplate,
  }
}
