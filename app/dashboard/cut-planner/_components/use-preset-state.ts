import { useEffect, useMemo, useState } from "react"
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
import {
  buildCustomTemplate,
  templateToDraft,
  getTemplateAreaSqFt,
  getTemplateBoundingBox,
  templateFitsStock,
  formatInches,
} from "./preset-utils"

function hydrateCustomTemplates(raw: string): { hydrated: CustomTemplateMap; maxId: number } | null {
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

export function usePresetState(
  onApply?: (templates: PartTemplate[]) => void,
  rollWidth?: number,
  rollLength?: number
) {
  const [selectedPart, setSelectedPart] = useState<SupportedPartType>("rectangle")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"all" | TemplateCategory>("all")
  const [customDrafts, setCustomDrafts] = useState<CustomPartDrafts>(DEFAULT_CUSTOM_DRAFTS)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateMap>(EMPTY_CUSTOM_TEMPLATES)
  const [nextCustomId, setNextCustomId] = useState(1)
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    const raw = getLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
    if (!raw) return
    const result = hydrateCustomTemplates(raw)
    if (!result) {
      removeLocalStorageValue(CUSTOM_TEMPLATE_STORAGE_KEY)
      return
    }
    // Defer to avoid React state updates during the initial render phase
    queueMicrotask(() => {
      setCustomTemplates(result.hydrated)
      setNextCustomId(result.maxId + 1)
    })
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

  // If stock dimensions are provided and the pending template's bounding box
  // exceeds the stock in both orientations, surface a clear error so the user
  // can't add a part that would render as a blank sheet.
  const customTemplateError = useMemo<string | null>(() => {
    if (!pendingCustomTemplate || rollWidth == null || rollLength == null) return null
    if (templateFitsStock(pendingCustomTemplate, rollWidth, rollLength)) return null
    const { width, height } = getTemplateBoundingBox(pendingCustomTemplate)
    return `Bounding box ${formatInches(width)}\u2033 \u00d7 ${formatInches(height)}\u2033 is larger than the ${formatInches(rollWidth)}\u2033 \u00d7 ${formatInches(rollLength)}\u2033 stock — won't fit on the sheet.`
  }, [pendingCustomTemplate, rollWidth, rollLength])

  // Per-template stock-fit check for the grid. When stock dims are unknown
  // we treat everything as fitting (back-compat — no callers without dims yet).
  const fitsStock = useMemo(() => {
    return (template: PartTemplate): boolean => {
      if (rollWidth == null || rollLength == null) return true
      return templateFitsStock(template, rollWidth, rollLength)
    }
  }, [rollWidth, rollLength])

  const totalArea = selectedTemplates.reduce(
    (acc, template) => acc + getTemplateAreaSqFt(template),
    0
  )

  useEffect(() => {
    onApply?.(selectedTemplates)
  }, [onApply, selectedTemplates])

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
        // Block adding a preset whose bounding box exceeds the stock — it
        // would render as a blank sheet.
        const template = allTemplates.find((t) => t.id === templateId)
        if (template && !fitsStock(template)) return previous
        next.add(templateId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    setChecked((previous) => {
      const next = new Set(previous)
      for (const template of sizeOptions) {
        if (fitsStock(template)) next.add(template.id)
      }
      return next
    })
  }

  // If the stock shrinks below an already-selected preset, drop it from the
  // selection so the layout doesn't silently break.
  useEffect(() => {
    setChecked((previous) => {
      let mutated = false
      const next = new Set(previous)
      for (const id of previous) {
        const template = allTemplates.find((t) => t.id === id)
        if (template && !fitsStock(template)) {
          next.delete(id)
          mutated = true
        }
      }
      return mutated ? next : previous
    })
  }, [allTemplates, fitsStock])

  const handleClearAll = () => {
    setChecked(new Set())
    setQuantities(new Map())
  }

  const customDraft = customDrafts[selectedPart]
  const selectedPartLabel =
    PART_OPTIONS.find((part) => part.partType === selectedPart)?.label ?? "Part"
  const savedCustomCount = customTemplates[selectedPart].length

  const handleAddCustomSize = () => {
    if (!pendingCustomTemplate || customTemplateError) return

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
    customTemplateError,
    fitsStock,
    totalArea,
    customDraft,
    selectedPartLabel,
    savedCustomCount,
    quantities,
    selectionCounts,
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
