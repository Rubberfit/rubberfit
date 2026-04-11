import { useEffect, useMemo, useState } from "react"
import {
  getLocalStorageValue,
  removeLocalStorageValue,
  setLocalStorageValue,
} from "@/lib/local-storage.client"

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

export function usePresetState(onApply?: (templates: PartTemplate[]) => void) {
  const [selectedPart, setSelectedPart] = useState<SupportedPartType>("rectangle")
  const [checked, setChecked] = useState<Set<string>>(new Set())
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

  useEffect(() => {
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
