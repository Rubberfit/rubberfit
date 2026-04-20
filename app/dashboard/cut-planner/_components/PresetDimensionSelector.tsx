"use client"

import React, { useState } from "react"
import { BookMarked, ChevronDown, LayoutGrid, Save, Trash2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { CheckSquare, Square } from "lucide-react"

import PresetCustomTemplateForm from "./preset-custom-template-form"
import PresetSelectionSummary from "./preset-selection-summary"
import { PresetTemplateGrid } from "./preset-template-grid"
import { PartTypeSelector } from "./preset-part-type-selector"
import { usePresetState } from "./use-preset-state"
import type { LoadedSelection } from "./use-preset-state"
import type { SelectionPreset } from "./selection-presets"

import type { PartTemplate } from "./preset-template-data"

export type { PartTemplate } from "./preset-template-data"
export { PART_TEMPLATES } from "./preset-template-data"
export type { LoadedSelection } from "./use-preset-state"

interface PresetDimensionSelectorProps {
  onApply?: (templates: PartTemplate[]) => void
  rollWidth?: number
  rollLength?: number
  tagMap?: Map<string, string>
  loadedSelection?: LoadedSelection | null
}

// ── Preset panel ──────────────────────────────────────────────────────────────

interface PresetPanelProps {
  selectionPresets: SelectionPreset[]
  hasSelection: boolean
  onSave: (name: string) => boolean
  onLoad: (preset: SelectionPreset) => void
  onDelete: (presetId: string) => void
}

function PresetPanel({ selectionPresets, hasSelection, onSave, onLoad, onDelete }: PresetPanelProps) {
  const [open, setOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [saveError, setSaveError] = useState("")

  const handleSave = () => {
    if (!saveName.trim()) {
      setSaveError("Enter a preset name")
      return
    }
    const saved = onSave(saveName)
    if (saved) {
      setSaveName("")
      setSaveError("")
    }
  }

  const handleLoad = (preset: SelectionPreset) => {
    onLoad(preset)
    setOpen(false)
  }

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="h-7 gap-1.5 text-xs"
      >
        <BookMarked className="h-3.5 w-3.5" />
        Presets
        {selectionPresets.length > 0 && (
          <span className="ml-0.5 rounded-full bg-blue-100 px-1.5 text-blue-700 text-[10px] font-bold">
            {selectionPresets.length}
          </span>
        )}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {/* Save row */}
          <div className="border-b border-slate-100 p-3 dark:border-slate-700">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
              Save current selection
            </div>
            <div className="flex gap-1.5">
              <Input
                value={saveName}
                onChange={(e) => {
                  setSaveName(e.target.value)
                  if (saveError) setSaveError("")
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
                placeholder="Preset name…"
                className="h-7 flex-1 text-xs"
                disabled={!hasSelection}
              />
              <Button
                type="button"
                size="sm"
                className="h-7 px-2"
                onClick={handleSave}
                disabled={!hasSelection || !saveName.trim()}
              >
                <Save className="h-3.5 w-3.5" />
              </Button>
            </div>
            {saveError && (
              <div className="mt-1 text-[11px] text-red-500">{saveError}</div>
            )}
            {!hasSelection && (
              <div className="mt-1 text-[11px] text-slate-400">
                Select at least one size to save.
              </div>
            )}
          </div>

          {/* Preset list */}
          <div className="max-h-56 overflow-y-auto">
            {selectionPresets.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                No saved presets yet.
              </div>
            ) : (
              selectionPresets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {preset.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {preset.templates.length} size{preset.templates.length !== 1 ? "s" : ""}{" "}
                      · {[...new Set(preset.templates.map((t) => t.partType))].join(", ")}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleLoad(preset)}
                  >
                    Load
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => onDelete(preset.id)}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Close */}
          <button
            type="button"
            aria-label="Close presets"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PresetDimensionSelector({
  onApply,
  rollWidth = 96,
  rollLength = 48,
  tagMap,
  loadedSelection,
}: PresetDimensionSelectorProps) {
  const {
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
    selectionPresets,
    saveCurrentAsPreset,
    deletePreset,
    loadPreset,
    handlePartChange,
    handleToggle,
    handleQuantityChange,
    handleSelectAll,
    handleClearAll,
    handleAddCustomSize,
    editCustomTemplate,
    removeCustomTemplate,
  } = usePresetState(onApply, rollWidth, rollLength, loadedSelection)

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <LayoutGrid className="h-4 w-4 text-slate-500" />
            Part Selection
          </CardTitle>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-xs text-slate-500">
              Preview stock: {rollWidth}" x {rollLength}"
            </div>
            <PresetPanel
              selectionPresets={selectionPresets}
              hasSelection={selectedTemplates.length > 0}
              onSave={saveCurrentAsPreset}
              onLoad={loadPreset}
              onDelete={deletePreset}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <PartTypeSelector
          selectedPart={selectedPart}
          onPartChange={handlePartChange}
          selectionCounts={selectionCounts}
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              2. Choose Standard Size
            </div>

            <div className="flex gap-1.5 flex-wrap ">
              {availableCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setFilter(category)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    filter === category
                      ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-100 dark:text-slate-800 dark:border-slate-100"
                      : "bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-card dark:text-slate-400 dark:border-slate-700 dark:hover:border-slate-500"
                  }`}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleSelectAll}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <CheckSquare className="h-3 w-3" /> Select all
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center gap-1 text-xs text-slate-500 hover:underline"
            >
              <Square className="h-3 w-3" /> Clear
            </button>
          </div>

          <PresetTemplateGrid
            visible={visible}
            checked={checked}
            quantities={quantities}
            editingCustomId={editingCustomId}
            onToggle={handleToggle}
            onQuantityChange={handleQuantityChange}
            onEditCustom={editCustomTemplate}
            onRemoveCustom={removeCustomTemplate}
            tagMap={tagMap}
            fitsStock={fitsStock}
          />

          <PresetCustomTemplateForm
            selectedPart={selectedPart}
            selectedPartLabel={selectedPartLabel}
            customDraft={customDraft as Record<string, string>}
            customDrafts={customDrafts}
            setCustomDrafts={setCustomDrafts}
            savedCustomCount={savedCustomCount}
            editingCustomId={editingCustomId}
            setEditingCustomId={setEditingCustomId}
            pendingCustomTemplate={pendingCustomTemplate}
            customTemplateError={customTemplateError}
            onAddCustomSize={handleAddCustomSize}
          />
        </div>

        <PresetSelectionSummary
          selectedTemplates={selectedTemplates}
          totalArea={totalArea}
          onToggle={handleToggle}
          onRemoveCustom={removeCustomTemplate}
        />
      </CardContent>
    </Card>
  )
}
