"use client"

import { useMemo, useState, useCallback, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { FileUp, Info, Ruler, Scissors, Shapes, X } from "lucide-react"
import NestingVisualizer from "./_components/NestingVisualizer"
import PresetDimensionSelector, {
  type PartTemplate,
  type LoadedSelection,
} from "./_components/PresetDimensionSelector"
import CutListUpload from "./_components/cut-list-upload"
import type { ExtractedPart } from "./_components/upload-types"
import type { SimpleCutDirection, SimplePartType } from "./_components/NestingVisualizer"
import type { SimpleCutMetrics } from "./_components/nesting-visualizer-types"
import {
  StockPreviewConfigurator,
  STOCK_PRESETS,
  type StockConfig,
} from "./_components/stock-preview-configurator"
import { CutConfigCard } from "./_components/cut-config-card"
import {
  getRequestedSqFt,
  getDefaultCutDirection,
  parseCutRatios,
} from "./_components/cut-planner-utils"
import { PART_OPTIONS, type SupportedPartType } from "./_components/preset-template-data"
import { RecordedCutSelect } from "./_components/recorded-cut-select"
import { type CutHistory, type PartCustomDimensions } from "@/src/infrastructure/models/supabase"

// Constants

const DEMO_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "Natural Rubber",
  thickness: 0.5,
}

// Maps part_id (1-based index into PART_OPTIONS) back to a SupportedPartType
const PART_ID_TO_TYPE: Record<number, SupportedPartType> = {
  1: "rectangle",
  2: "cylinder",
  3: "cone",
  4: "trapezoid",
}

// Helpers

function LayoutLabel() {
  return <Ruler className="h-4 w-4 text-slate-500" />
}

/**
 * Best-effort reconstruction of geometric parameters from a stored size label.
 * Falls back to empty object if the label can't be parsed (nesting engine will
 * use its own defaults in that case).
 */
function parseDimsFromLabel(
  partType: SimplePartType,
  label: string,
  customWidth: number | null,
  customHeight: number | null
): Partial<PartTemplate> {
  // Custom templates stored explicit dimensions — use them directly
  if (customWidth != null && customHeight != null) {
    if (partType === "rectangle") return { width: customWidth, length: customHeight }
    if (partType === "cylinder") return { diameter: customWidth, height: customHeight }
    return { width: customWidth, height: customHeight }
  }

  const n = "(\\d+(?:\\.\\d+)?)"

  if (partType === "rectangle") {
    // e.g. `18" × 14"`
    const m = label.match(new RegExp(`${n}["\u2033]?\\s*[×x]\\s*${n}`))
    if (m) return { width: parseFloat(m[1]), length: parseFloat(m[2]) }
  }

  if (partType === "cylinder") {
    // e.g. `Ø18" × 24"`
    const m = label.match(new RegExp(`[Øø]?\\s*${n}["\u2033]?\\s*[×x]\\s*${n}`))
    if (m) return { diameter: parseFloat(m[1]), height: parseFloat(m[2]) }
  }

  if (partType === "cone") {
    // e.g. `120° • R10" to R28"`
    const m = label.match(new RegExp(`${n}°.*R${n}["\u2033]?\\s+to\\s+R${n}`))
    if (m) return { arcDegrees: parseFloat(m[1]), innerRadius: parseFloat(m[2]), outerRadius: parseFloat(m[3]) }
  }

  if (partType === "trapezoid") {
    // e.g. `18" / 24" × 42"`
    const m = label.match(new RegExp(`${n}["\u2033]?\\s*/\\s*${n}["\u2033]?\\s*[×x]\\s*${n}`))
    if (m) return { topWidth: parseFloat(m[1]), bottomWidth: parseFloat(m[2]), height: parseFloat(m[3]) }
  }

  return {}
}

//  CutLoader
// Reads ?loadCut=<id> on mount, fetches the record, then clears the param.
// Must be a separate component so useSearchParams() can be wrapped in Suspense.

interface CutLoaderProps {
  onLoad: (cut: CutHistory) => void
}

function CutLoaderInner({ onLoad }: CutLoaderProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const loadCutId = searchParams.get("loadCut")
  const didFetch = useRef(false)

  useEffect(() => {
    if (!loadCutId || didFetch.current) return
    didFetch.current = true

    fetch(`/api/cuts/history/${encodeURIComponent(loadCutId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`)
        const json = (await res.json()) as { data: CutHistory }
        onLoad(json.data)
      })
      .catch(() => {
        toast.error("Could not load cut record")
      })
      .finally(() => {
        router.replace("/dashboard/cut-planner")
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCutId])

  return null
}

function CutLoader(props: CutLoaderProps) {
  return (
    <Suspense fallback={null}>
      <CutLoaderInner {...props} />
    </Suspense>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line max-lines-per-function
export default function CutPlannerPage() {
  const [presetParts, setPresetParts] = useState<PartTemplate[]>([])
  const [uploadedParts, setUploadedParts] = useState<PartTemplate[]>([])
  const [quantity, setQuantity] = useState(1)
  const [cutDirection, setCutDirection] = useState<SimpleCutDirection>("vertical_split")
  const [customCutRatioInput, setCustomCutRatioInput] = useState("")
  const [stock, setStock] = useState(DEMO_STOCK)
  const [cutMetrics, setCutMetrics] = useState<SimpleCutMetrics | null>(null)
  const [isRecordingCut, setIsRecordingCut] = useState(false)
  const [loadedSelection, setLoadedSelection] = useState<LoadedSelection | null>(null)
  const [loadedFromHistory, setLoadedFromHistory] = useState(false)

  const selectedTemplates = useMemo(
    () => [...uploadedParts, ...presetParts],
    [uploadedParts, presetParts]
  )
  const selectedTemplate = selectedTemplates[0] ?? null

  const requestedSqFt = useMemo(
    () => getRequestedSqFt(selectedTemplates, quantity),
    [quantity, selectedTemplates]
  )

  const tagMap = useMemo(() => {
    const labels = [...new Set(selectedTemplates.map((t) => t.label))]
    return new Map(
      labels.map((label, i) => {
        let tag = ""
        let n = i
        do {
          tag = String.fromCharCode(65 + (n % 26)) + tag
          n = Math.floor(n / 26) - 1
        } while (n >= 0)
        return [label, tag]
      })
    )
  }, [selectedTemplates])

  // ── Load a previously recorded cut ────────────────────────────────────────
  const handleLoadCut = useCallback((cut: CutHistory) => {
    // 1. Restore stock dimensions
    const stockPreset = cut.material_id >= 1 ? STOCK_PRESETS[cut.material_id - 1] : null
    setStock({
      width: cut.cut_width,
      length: cut.cut_length,
      thickness: cut.cut_thickness,
      material: stockPreset?.label ?? `${cut.cut_width}" × ${cut.cut_length}"`,
    })

    // 2. Restore quantity
    setQuantity(cut.cut_amount)

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
  }, [])

  // ── Other handlers ────────────────────────────────────────────────────────
  const handleTemplateApply = useCallback((templates: PartTemplate[]) => {
    setPresetParts(templates)
    setQuantity((previous) => Math.max(1, previous))
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

  const safeQuantity = Math.max(1, Number.isFinite(quantity) ? quantity : 1)
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
        quantity: template.isCustom ? template.quantity : safeQuantity,
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

  const handleRecordCut = useCallback(async () => {
    if (!selectedTemplate) return
    setIsRecordingCut(true)
    try {
      const materialId = activeStockPreset
        ? STOCK_PRESETS.findIndex((p) => p.id === activeStockPreset) + 1
        : 0
      const partId =
        PART_OPTIONS.findIndex((p) => p.partType === selectedTemplate.partType) + 1

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

      const payload = {
        material_id: materialId,
        part_id: partId,
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
      }

      const response = await fetch("/api/cuts/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const text = await response.text()
        console.error("Failed to record cut:", text)
        toast.error("Failed to save cut to history")
      } else {
        toast.success("Cut recorded!")
      }
    } catch (error) {
      console.error("Record cut error:", error)
      toast.error("Failed to save cut to history")
    } finally {
      setIsRecordingCut(false)
    }
  }, [selectedTemplate, selectedTemplates, activeStockPreset, stock, safeQuantity, cutMetrics])

  // Render
  return (
    <div className="space-y-6">
      <CutLoader
        onLoad={(cut) => {
          handleLoadCut(cut)
          setLoadedFromHistory(true)
        }}
      />

      {loadedFromHistory && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Cut loaded from history — all fields are editable. Adjust and click{" "}
            <strong>Cut</strong> to record a new entry.
          </span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setLoadedFromHistory(false)}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Badge variant="outline" className="w-fit">
            Cut Planner
          </Badge>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-300">
              Cut Planner
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Select a finished profile, choose the standard size, set the cut count, and preview
              the nested cut sheet for rectangles, strips, wraps, spreads, and panel layouts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          <RecordedCutSelect onLoad={handleLoadCut} />
          <Button asChild variant="outline">
            <Link href="/dashboard/cut-planner/batch">Batch Mode</Link>
          </Button>
        </div>
      </div>

      <CutListUpload onPartsConfirmed={handleUploadedParts} />

      {uploadedParts.length > 0 && (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <FileUp className="h-4 w-4 text-blue-500" />
                Uploaded Parts
                <Badge variant="secondary" className="ml-1 text-xs">
                  {uploadedParts.reduce((sum, p) => sum + p.quantity, 0)} cuts
                </Badge>
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearUploadedParts}
                className="h-7 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="mr-1 h-3 w-3" />
                Clear All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {uploadedParts.map((part) => {
                const tag = tagMap.get(part.label)
                return (
                  <div
                    key={part.id}
                    className="group flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-1 pr-2 py-1 text-xs transition-colors hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
                  >
                    {tag && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-white dark:bg-slate-200 dark:text-slate-800">
                        {tag}
                      </span>
                    )}
                    <span className="font-medium">{part.label}</span>
                    {part.quantity > 1 && (
                      <span className="text-muted-foreground">qty {part.quantity}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeUploadedPart(part.id)}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove part"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <StockPreviewConfigurator
        activeStockPreset={activeStockPreset}
        stock={stock}
        onStockChange={setStock}
      />

      <PresetDimensionSelector
        onApply={handleTemplateApply}
        rollWidth={stock.width}
        rollLength={stock.length}
        tagMap={tagMap}
        loadedSelection={loadedSelection}
      />

      {selectedTemplates.length > 0 && selectedTemplate ? (
        <>
          <CutConfigCard
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            safeQuantity={safeQuantity}
            quantity={quantity}
            setQuantity={setQuantity}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            customCutRatioInput={customCutRatioInput}
            setCustomCutRatioInput={setCustomCutRatioInput}
            customCutRatios={customCutRatios}
            requestedSqFt={requestedSqFt}
          />

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <LayoutLabel />
                  4. Graph
                </CardTitle>
                {cutMetrics !== null && cutMetrics.partsCompleted > 0 && (
                  <Button
                    size="sm"
                    onClick={handleRecordCut}
                    disabled={isRecordingCut}
                  >
                    <Scissors className="mr-1.5 h-4 w-4" />
                    {isRecordingCut ? "Recording…" : "Cut"}
                  </Button>
                )}
              </div>
              <CardDescription>
                The graph starts from rectangular stock and shows the actual cut pieces placed on
                that stock, with reusable offcut in amber and waste in red.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <NestingVisualizer
                defaultRollWidth={stock.width}
                defaultRollLength={stock.length}
                defaultCutWidth={selectedTemplate.width ?? selectedTemplate.diameter ?? 24}
                defaultCutHeight={selectedTemplate.length ?? selectedTemplate.height ?? 24}
                defaultQty={safeQuantity}
                simpleMode
                onMetricsChange={setCutMetrics}
                simpleParts={nestingSimpleParts}
                simplePart={nestingSimplePart}
              />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border border-dashed border-slate-300 bg-slate-50/60 shadow-sm dark:bg-slate-700/50">
          <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 py-10 text-center">
            <Shapes className="h-6 w-6 text-slate-400" />
            <div className="text-base font-semibold text-slate-900 dark:text-slate-300">
              Choose a part type and standard size
            </div>
            <div className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
              Start with the part selection above. Once a standard size is picked, the amount of
              cuts and graph preview will appear underneath.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
