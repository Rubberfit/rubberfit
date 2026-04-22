"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { toast } from "sonner"
import { Info, Shapes, X } from "lucide-react"
import NestingVisualizer from "./_components/NestingVisualizer"
import { usePackGate } from "./_hooks/use-pack-gate"
import PresetDimensionSelector, {
  type PartTemplate,
  type LoadedSelection,
} from "./_components/PresetDimensionSelector"
import CutListUpload from "./_components/cut-list-upload"
import type { ExtractedPart } from "@/src/application/vision/types"
import type { SimpleCutDirection } from "./_components/NestingVisualizer"
import type { SimpleCutMetrics } from "./_components/nesting-visualizer-types"
import { STOCK_PRESETS, type StockConfig } from "./_components/stock-preview-configurator"
import {
  getRequestedSqFt,
  getDefaultCutDirection,
  parseCutRatios,
  parseDimsFromLabel,
} from "./_components/cut-planner-utils"
import { PART_OPTIONS, type SupportedPartType } from "./_components/preset-template-data"
import {
  type CutHistory,
  type MaterialType,
  type PartCustomDimensions,
} from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { buildAndUploadCutPdf } from "./_components/cut-history-pdf"
import { CutLoader } from "./_components/cut-loader"
import { RollLoader } from "./_components/roll-loader"
import { JobLoader } from "./_components/job-loader"
import type { JobFullDetail, Roll } from "@/src/infrastructure/models/supabase"
import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { PageShell } from "@/app/components/patterns/page-shell"
import { WorkspaceRow, WorkspaceColumn } from "@/app/components/patterns/workspace-column"
import { PartsQueuePanel, type PartsFilter } from "./_components/parts-queue-panel"
import { CanvasToolbar } from "./_components/canvas-toolbar"
import { StrategyResultsPanel } from "./_components/strategy-results-panel"
import { TweaksPanel } from "./_components/tweaks-panel"
import KonvaSheetRenderer from "./_components/KonvaSheetRenderer"
import type { LayoutModel } from "./_components/layout-model"

// Constants

const DEMO_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "",
  thickness: 0.5,
}

// Maps part_id (1-based index into PART_OPTIONS) back to a SupportedPartType
const PART_ID_TO_TYPE: Record<number, SupportedPartType> = {
  1: "rectangle",
  2: "cylinder",
  3: "cone",
  4: "trapezoid",
}

// ── Page ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line max-lines-per-function
export default function CutPlannerPage() {
  const [presetParts, setPresetParts] = useState<PartTemplate[]>([])
  const [uploadedParts, setUploadedParts] = useState<PartTemplate[]>([])
  const [cutDirection, setCutDirection] = useState<SimpleCutDirection>("vertical_split")
  const [customCutRatioInput, setCustomCutRatioInput] = useState("")
  const [stock, setStock] = useState(DEMO_STOCK)
  const [cutMetrics, setCutMetrics] = useState<SimpleCutMetrics | null>(null)
  const [isRecordingCut, setIsRecordingCut] = useState(false)
  const [cutListRefreshKey, setCutListRefreshKey] = useState(0)
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loadedSelection, setLoadedSelection] = useState<LoadedSelection | null>(null)
  const [loadedFromHistory, setLoadedFromHistory] = useState(false)
  /**
   * Set when the engine is opened via `?loadRoll=<id>` so the
   * eventual cut record can be tied back to a specific inventory
   * roll. Cleared automatically by the `setStock` wrapper below
   * when the operator edits stock dimensions manually — once the
   * dims no longer match the loaded roll, we can't honestly claim
   * the cut came from it.
   */
  const [sourceRollId, setSourceRollId] = useState<string | null>(null)
  /**
   * Set when the engine is opened via `?loadJob=<id>` from a job's
   * drawer. Stamped onto `cut_history.job_id` when the operator
   * presses Cut, so the job detail drawer's "Cuts recorded" panel
   * picks up the record.
   */
  const [sourceJob, setSourceJob] = useState<Pick<
    JobFullDetail,
    "id" | "job_number" | "name" | "customer_name"
  > | null>(null)
  const [partsFilter, setPartsFilter] = useState<PartsFilter>("all")
  const [layouts, setLayouts] = useState<LayoutModel[]>([])

  const hasSelectedTemplates = presetParts.length + uploadedParts.length > 0
  useEffect(() => {
    if (!hasSelectedTemplates) setLayouts([])
  }, [hasSelectedTemplates])

  // Pack-gate: the Graph card doesn't mount the NestingVisualizer
  // until the operator presses **Pack**. Any change to parts,
  // stock, or cut-direction resets the gate to `idle` so the
  // operator has to re-pack against the current inputs — this kills
  // the old live-preview churn that nudged operators into cutting
  // before their inputs had settled.
  const packGate = usePackGate()

  useEffect(() => {
    materialTypeService
      .getAll()
      .then(setMaterialTypes)
      .catch((_err) => {
        console.error("Failed to load material types:", _err)
      })
  }, [])

  const selectedTemplates = useMemo(
    () => [...uploadedParts, ...presetParts],
    [uploadedParts, presetParts]
  )
  const selectedTemplate = selectedTemplates[0] ?? null

  const requestedSqFt = useMemo(() => getRequestedSqFt(selectedTemplates), [selectedTemplates])

  // Tag map: keyed by String(index) → tag value.
  // Uses part numbers (e.g. "G2") when available, falls back to generated letters (A, B, C…).
  const tagMap = useMemo(() => {
    let fallbackIdx = 0
    return new Map(
      selectedTemplates.map((t, i) => {
        if (t.partNumber) return [String(i), t.partNumber]
        let tag = ""
        let n = fallbackIdx++
        do {
          tag = String.fromCharCode(65 + (n % 26)) + tag
          n = Math.floor(n / 26) - 1
        } while (n >= 0)
        return [String(i), tag]
      })
    )
  }, [selectedTemplates])

  // Lookup by template ID → tag letter (for preset grid badges + uploaded parts)
  const tagByTemplateId = useMemo(() => {
    return new Map(selectedTemplates.map((t, i) => [t.id, tagMap.get(String(i)) ?? ""]))
  }, [selectedTemplates, tagMap])

  // ── Load a previously recorded cut ────────────────────────────────────────
  const handleLoadCut = useCallback(
    (cut: CutHistory) => {
      // 1. Restore stock dimensions
      const stockPreset = cut.material_id >= 1 ? STOCK_PRESETS[cut.material_id - 1] : null
      const materialName =
        cut.stock_label ?? stockPreset?.label ?? `${cut.cut_width}" × ${cut.cut_length}"`
      const matchedMt = materialTypes.find((mt) => mt.name === materialName)
      setStock({
        width: cut.cut_width,
        length: cut.cut_length,
        thickness: cut.cut_thickness,
        material: materialName,
        costPerSqft: cut.cost_per_sqft ?? undefined,
        materialTypeId: matchedMt?.id,
      })

      // 3. Reconstruct part templates from stored labels + dimensions
      const partType = PART_ID_TO_TYPE[cut.part_id] ?? "rectangle"
      const sizeTexts = cut.part_selected_size_text ?? []
      const sizeLabels = cut.part_selected_label ?? []
      const storedDims = cut.part_custom_dimensions

      const resolveDims = (label: string, i: number): Partial<PartTemplate> => {
        // Prefer explicit stored dimensions (new records); fall back to label
        // regex for backward compatibility with old records.
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
        return parseDimsFromLabel(
          partType,
          label,
          i === 0 ? cut.part_custom_width : null,
          i === 0 ? cut.part_custom_height : null
        )
      }

      const templates: PartTemplate[] =
        sizeTexts.length > 0
          ? sizeTexts.map((label, i) => ({
              id: `loaded-${cut.id}-${i}`,
              partType,
              label,
              summary: sizeLabels[i] ?? label,
              quantity: cut.cut_amount,
              category: "custom" as const,
              isCustom: true,
              ...resolveDims(label, i),
            }))
          : [
              {
                id: `loaded-${cut.id}-0`,
                partType,
                label: `${cut.cut_width}" × ${cut.cut_length}"`,
                summary: "Loaded cut",
                quantity: cut.cut_amount,
                category: "custom" as const,
                isCustom: true,
                width: cut.part_custom_width ?? cut.cut_width,
                length: cut.part_custom_height ?? cut.cut_length,
              },
            ]

      // 4. Apply — clear uploaded parts so loaded config is the only source
      setUploadedParts([])
      setPresetParts(templates)
      setCutDirection(getDefaultCutDirection(partType))
      setCustomCutRatioInput("")

      // 5. Signal PresetDimensionSelector to select matching checkboxes.
      //    Pass stored dimension data when available so the selector can
      //    auto-create custom templates (index 0 fills the form, 1..n are
      //    added to the list and checked).
      setLoadedSelection({
        partType,
        labels: sizeTexts,
        nonce: Date.now(),
        customDimensions: storedDims ?? undefined,
      })

      toast.success("Cut configuration loaded")
    },
    [materialTypes]
  )

  // ── Load a job into the engine ────────────────────────────────────────────
  // Invoked by `?loadJob=<id>` — stashes the job id so the next
  // cut stamps `cut_history.job_id`, and drops a banner so the
  // operator knows which project they're cutting for. Parts are NOT
  // auto-loaded into the nesting surface (jobs parts can be many
  // different dimensions; the operator picks per cut). The loader
  // just tags subsequent cuts to the job.
  const handleLoadJob = useCallback((job: JobFullDetail) => {
    setSourceJob({
      id: job.id,
      job_number: job.job_number,
      name: job.name,
      customer_name: job.customer_name,
    })
    toast.success(`Cutting for ${job.job_number ?? "job"}`, {
      description: job.customer_name ? `${job.name} · ${job.customer_name}` : job.name,
    })
  }, [])

  // ── Load a roll as a blank sheet (no parts, no cuts) ──────────────────────
  // Invoked by `?loadRoll=<id>` — the inventory detail drawer deep-links
  // here so the user can start a fresh cut with the roll's dimensions
  // already filled in. Also stashes the roll id so the eventual
  // cut_history insert can link back (see `handleRecordCut`).
  const handleLoadRoll = useCallback(
    (roll: Roll) => {
      const matched = materialTypes.find((mt) => mt.name === roll.material_type)
      setStock({
        width: roll.width,
        length: roll.remaining_length > 0 ? roll.remaining_length : roll.length,
        thickness: roll.thickness,
        material: roll.material_type,
        costPerSqft: roll.cost_per_sqft ?? undefined,
        materialTypeId: matched?.id,
      })
      setSourceRollId(roll.id)
      toast.success(`Loaded ${roll.material_type}`, {
        description: `${roll.width}″ × ${
          roll.remaining_length > 0 ? roll.remaining_length : roll.length
        }″ ready in the engine`,
      })
    },
    [materialTypes]
  )

  // ── Other handlers ────────────────────────────────────────────────────────
  const handleTemplateApply = useCallback((templates: PartTemplate[]) => {
    setPresetParts(templates)
    setCutDirection(getDefaultCutDirection(templates[0]?.partType ?? "rectangle"))
    setCustomCutRatioInput("")
  }, [])

  const handleUploadedParts = (parts: ExtractedPart[], stockWidth?: number) => {
    const uploaded: PartTemplate[] = parts.map((p, i) => ({
      id: `uploaded-${Date.now()}-${i}`,
      partType: "rectangle" as const,
      label: `${p.width}" × ${p.length}"`,
      summary: p.partNumber ? `Uploaded: ${p.partNumber}` : "Uploaded dimension",
      quantity: p.quantity,
      category: "custom" as const,
      width: p.width,
      length: p.length,
      isCustom: true,
      partNumber: p.partNumber ?? undefined,
    }))
    setUploadedParts((prev) => [...prev, ...uploaded])
    if (stockWidth && stockWidth > 0) {
      setStock((prev) => ({ ...prev, width: stockWidth }))
    }
  }

  const removeUploadedPart = (id: string) => {
    setUploadedParts((prev) => prev.filter((p) => p.id !== id))
  }

  const clearUploadedParts = () => {
    setUploadedParts([])
  }

  const safeQuantity = Math.max(1, selectedTemplate?.quantity ?? 1)
  const customCutRatios = useMemo(
    () => parseCutRatios(customCutRatioInput, safeQuantity),
    [customCutRatioInput, safeQuantity]
  )
  const activeStockPreset = STOCK_PRESETS.find(
    (preset) => preset.width === stock.width && preset.length === stock.length
  )?.id

  const nestingSimpleParts = useMemo(
    () =>
      selectedTemplates.map((template) => ({
        partType: template.partType,
        quantity: template.quantity,
        cutDirection,
        cutRatios: customCutRatios,
        width: template.width,
        length: template.length,
        diameter: template.diameter,
        height: template.height,
        topWidth: template.topWidth,
        bottomWidth: template.bottomWidth,
        innerRadius: template.innerRadius,
        outerRadius: template.outerRadius,
        arcDegrees: template.arcDegrees,
        partNumber: template.partNumber,
      })),
    [selectedTemplates, safeQuantity, cutDirection, customCutRatios]
  )

  const nestingSimplePart = useMemo(
    () =>
      selectedTemplate
        ? {
            partType: selectedTemplate.partType,
            quantity: safeQuantity,
            cutDirection,
            cutRatios: customCutRatios,
            width: selectedTemplate.width,
            length: selectedTemplate.length,
            diameter: selectedTemplate.diameter,
            height: selectedTemplate.height,
            topWidth: selectedTemplate.topWidth,
            bottomWidth: selectedTemplate.bottomWidth,
            innerRadius: selectedTemplate.innerRadius,
            outerRadius: selectedTemplate.outerRadius,
            arcDegrees: selectedTemplate.arcDegrees,
          }
        : undefined,
    [selectedTemplate, safeQuantity, cutDirection, customCutRatios]
  )

  // eslint-disable-next-line complexity
  const handleRecordCut = useCallback(async () => {
    if (!selectedTemplate) return
    setIsRecordingCut(true)
    try {
      const materialId = activeStockPreset
        ? STOCK_PRESETS.findIndex((p) => p.id === activeStockPreset) + 1
        : 0
      const partId = PART_OPTIONS.findIndex((p) => p.partType === selectedTemplate.partType) + 1

      const partSelectedSize = selectedTemplates.map((_, i) => i + 1)
      const partSelectedSizeText = selectedTemplates.map((t) => t.label)
      const partSelectedLabel = selectedTemplates.map((t) =>
        t.partType === "rectangle" ? t.summary : `${t.summary} ${t.label}`
      )

      const partCustomDimensions: PartCustomDimensions[] = selectedTemplates.map((t) => ({
        ...(t.width !== undefined && { width: t.width }),
        ...(t.length !== undefined && { length: t.length }),
        ...(t.diameter !== undefined && { diameter: t.diameter }),
        ...(t.height !== undefined && { height: t.height }),
        ...(t.topWidth !== undefined && { topWidth: t.topWidth }),
        ...(t.bottomWidth !== undefined && { bottomWidth: t.bottomWidth }),
        ...(t.innerRadius !== undefined && { innerRadius: t.innerRadius }),
        ...(t.outerRadius !== undefined && { outerRadius: t.outerRadius }),
        ...(t.arcDegrees !== undefined && { arcDegrees: t.arcDegrees }),
      }))

      const stockLabel =
        stock.material ||
        (activeStockPreset
          ? STOCK_PRESETS.find((p) => p.id === activeStockPreset)?.label
          : `${stock.width}" × ${stock.length}"`) ||
        "Unknown"

      // Resolve the source roll: explicit link (opened from the
      // inventory drawer via ?loadRoll) takes precedence; otherwise
      // auto-pick the oldest active roll matching the selected
      // material so the cut consumes from inventory FIFO. If no
      // material is selected the engine runs as a "general cutter"
      // — the cut records without a roll link and nothing is
      // decremented.
      let resolvedRollId = sourceRollId
      if (!resolvedRollId && stock.materialTypeId) {
        try {
          const candidates = await rollsSdk.list({
            status: "active",
            material_type_id: stock.materialTypeId,
          })
          const sorted = [...(candidates ?? [])].sort((a, b) => {
            const da = a.date_received ? Date.parse(a.date_received) : 0
            const db = b.date_received ? Date.parse(b.date_received) : 0
            return da - db
          })
          resolvedRollId = sorted[0]?.id ?? null
        } catch {
          // Non-fatal — cut still saves without a roll link.
        }
      }

      // Per-piece offcut geometry from the engine. Each element
      // becomes its own inventory row on the server so operators
      // can scan / consume them individually. Empty array is fine
      // (no reusable offcut) — server just skips the spawn loop.
      const offcutPieces =
        cutMetrics?.offcutPieces?.map((p) => ({
          width_in: p.widthIn,
          length_in: p.lengthIn,
        })) ?? []

      const payload = {
        material_id: materialId,
        part_id: partId,
        roll_id: resolvedRollId,
        job_id: sourceJob?.id ?? null,
        offcut_pieces: offcutPieces,
        cut_width: stock.width,
        cut_length: stock.length,
        cut_thickness: stock.thickness,
        cut_amount: safeQuantity,
        part_custom_width: selectedTemplate.isCustom ? (selectedTemplate.width ?? null) : null,
        part_custom_height: selectedTemplate.isCustom
          ? (selectedTemplate.length ?? selectedTemplate.height ?? null)
          : null,
        part_selected_size: partSelectedSize,
        part_selected_size_text: partSelectedSizeText,
        part_selected_label: partSelectedLabel,
        part_custom_dimensions: partCustomDimensions,
        parts_completed: cutMetrics?.partsCompleted ?? 0,
        cut_pieces: cutMetrics?.cutPieces ?? 0,
        material_used_sqft: cutMetrics?.materialUsedSqFt ?? 0,
        reusable_offset_sqft: cutMetrics?.reusableOffsetSqFt ?? 0,
        scrap_sqft: cutMetrics?.scrapSqFt ?? 0,
        fab_score: cutMetrics?.fabScore ?? 0,
        stock_label: stockLabel,
        cost_per_sqft: stock.costPerSqft ?? null,
      }

      const response = await fetch("/api/cuts/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // Read the body as text first so we see *something* even
        // when the server returns the Next.js default HTML error
        // page (e.g. when an unhandled throw bypasses our JSON
        // response). Then try to parse as JSON for the structured
        // `{ error, detail, code }` case.
        const rawText = await response.text()
        let detail: string | undefined
        let code: string | undefined
        try {
          const payload = JSON.parse(rawText) as {
            error?: string
            detail?: string
            code?: string
          }
          detail = payload.detail ?? payload.error
          code = payload.code
        } catch {
          // Not JSON — surface the raw text (truncated) so we can
          // at least see what the server actually sent.
          detail = rawText.slice(0, 200) || `HTTP ${response.status}`
        }
        console.error("Failed to record cut:", {
          status: response.status,
          rawText: rawText.slice(0, 500),
          detail,
          code,
        })
        toast.error("Failed to save cut to history", {
          description: detail ? (code ? `${detail} (${code})` : detail) : `HTTP ${response.status}`,
        })
      } else {
        const { data: savedCut } = (await response.json()) as { data: CutHistory }
        toast.success("Cut recorded!")
        setCutListRefreshKey((k) => k + 1)

        // Build tag→label map for PDF legend (keyed by tag letter, value is dimension label)
        const pdfTagMap = new Map<string, string>()
        for (const [idxStr, tag] of tagMap.entries()) {
          const t = selectedTemplates[Number(idxStr)]
          if (t) pdfTagMap.set(tag, t.label)
        }
        // Generate and upload PDF (awaited so pdf_url is available in history)
        try {
          await buildAndUploadCutPdf(
            savedCut.id,
            stock,
            cutMetrics,
            selectedTemplate,
            selectedTemplates,
            pdfTagMap,
            layouts
          )
        } catch (err) {
          console.error("PDF generation failed:", err)
        }
      }
    } catch (error) {
      console.error("Record cut error:", error)
      toast.error("Failed to save cut to history")
    } finally {
      setIsRecordingCut(false)
    }
  }, [
    selectedTemplate,
    selectedTemplates,
    activeStockPreset,
    stock,
    safeQuantity,
    cutMetrics,
    tagMap,
    layouts,
    sourceRollId,
    sourceJob?.id,
  ])

  // Render
  return (
    <PageShell variant="workspace">
      {/* Query-string loaders — no visible output, side-effects only */}
      <RollLoader onLoad={handleLoadRoll} />
      <JobLoader onLoad={handleLoadJob} />
      <CutLoader
        onLoad={(cut) => {
          handleLoadCut(cut)
          setLoadedFromHistory(true)
        }}
      />

      {/* Contextual banners */}
      {(sourceJob || loadedFromHistory) && (
        <div className="flex flex-col gap-2 px-4 pt-3">
          {sourceJob && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 text-xs">
                Cutting for <strong className="font-mono">{sourceJob.job_number}</strong>
                {" — "}
                {sourceJob.name}
                {sourceJob.customer_name ? (
                  <span className="text-blue-700 dark:text-blue-400">
                    {" · "}
                    {sourceJob.customer_name}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label="Clear job"
                onClick={() => setSourceJob(null)}
                className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {loadedFromHistory && (
            <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1 text-xs">
                Cut loaded from history — adjust and click <strong>Cut</strong> to record a new
                entry.
              </span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setLoadedFromHistory(false)}
                className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      <WorkspaceRow>
        {/* ── Left — Parts queue ── */}
        <WorkspaceColumn column="left">
          <PartsQueuePanel
            parts={selectedTemplates}
            activeFilter={partsFilter}
            onFilterChange={setPartsFilter}
          />
          {/* Upload trigger + preset selector live below the queue header */}
          <div className="border-t border-border/40 px-3 py-3">
            <CutListUpload onPartsConfirmed={handleUploadedParts} />
          </div>
          <div className="px-3 pb-4 overflow-y-auto">
            <PresetDimensionSelector
              onApply={handleTemplateApply}
              rollWidth={stock.width}
              rollLength={stock.length}
              tagMap={tagByTemplateId}
              loadedSelection={loadedSelection}
            />
          </div>
        </WorkspaceColumn>

        {/* ── Center — Canvas ── */}
        <WorkspaceColumn column="center">
          <div className="flex flex-col h-full">
            <CanvasToolbar />
            <div className="flex-1 min-h-0 overflow-auto p-4 relative">
              {selectedTemplates.length > 0 && selectedTemplate ? (
                <>
                  {/* NestingVisualizer stays mounted off-screen so TS NFP
                      computation and the async worker refinement continue
                      to run. It emits the LayoutModel[] that Konva renders.
                      Positioned absolutely with non-zero size so any internal
                      DOM-measurement paths still see real dimensions. */}
                  <div
                    aria-hidden
                    role="presentation"
                    className="absolute pointer-events-none opacity-0"
                    style={{
                      left: -9999,
                      top: 0,
                      width: Math.max(stock.width, stock.length) * 10,
                      height: Math.min(stock.width, stock.length) * 10,
                    }}
                  >
                    <NestingVisualizer
                      defaultRollWidth={stock.width}
                      defaultRollLength={stock.length}
                      defaultCutWidth={selectedTemplate.width ?? selectedTemplate.diameter ?? 24}
                      defaultCutHeight={selectedTemplate.length ?? selectedTemplate.height ?? 24}
                      defaultQty={safeQuantity}
                      onMetricsChange={setCutMetrics}
                      onLayoutChange={setLayouts}
                      simpleParts={nestingSimpleParts}
                      simplePart={nestingSimplePart}
                    />
                  </div>
                  {layouts.length > 0 ? (
                    <div className="flex flex-col gap-4 h-full">
                      {layouts.map((layout, i) => (
                        <div
                          key={i}
                          className="flex-1 min-h-[240px] rounded-md border border-border/40 bg-background overflow-hidden"
                        >
                          {layouts.length > 1 && (
                            <div className="px-3 py-1.5 border-b border-border/40 bg-muted/40">
                              <span className="text-xs font-medium text-foreground">
                                Sheet {i + 1} of {layouts.length}
                              </span>
                            </div>
                          )}
                          <KonvaSheetRenderer layout={layout} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Shapes className="h-10 w-10 opacity-20 animate-pulse" />
                      <p className="text-sm">Computing layout…</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Shapes className="h-10 w-10 opacity-20" />
                  <p className="text-sm">Pick a part on the left to start nesting.</p>
                </div>
              )}
            </div>
          </div>
        </WorkspaceColumn>

        {/* ── Right — Strategy & results ── */}
        <WorkspaceColumn column="right">
          <StrategyResultsPanel
            stock={stock}
            onStockChange={setStock}
            materialTypes={materialTypes}
            activeStockPreset={activeStockPreset ?? null}
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            safeQuantity={safeQuantity}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            customCutRatioInput={customCutRatioInput}
            setCustomCutRatioInput={setCustomCutRatioInput}
            customCutRatios={customCutRatios}
            requestedSqFt={requestedSqFt}
            cutMetrics={cutMetrics}
            onRecordCut={handleRecordCut}
            isRecordingCut={isRecordingCut}
            refreshKey={cutListRefreshKey}
            onLoadCut={handleLoadCut}
          />
        </WorkspaceColumn>
      </WorkspaceRow>

      <TweaksPanel />
    </PageShell>
  )
}
