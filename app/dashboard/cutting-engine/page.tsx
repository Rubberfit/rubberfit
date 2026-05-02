"use client"

import { useEffect, useMemo, useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { DebugOverlayToggles, type DebugOverlays } from "./_components/debug-overlay-toggles"
import { FileUp, Info, Ruler, Scissors, Shapes, X } from "lucide-react"
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
import {
  StockPreviewConfigurator,
  STOCK_PRESETS,
  DEFAULT_KERF_IN,
  type StockConfig,
} from "./_components/stock-preview-configurator"
import { CutConfigCard } from "./_components/cut-config-card"
import { getRequestedSqFt, getDefaultCutDirection } from "./_components/cut-planner-utils"
import { buildTemplatesFromCutRecord } from "./_components/cut-load-utils"
import { PART_OPTIONS } from "./_components/preset-template-data"
import { RecordedCutSelect } from "./_components/recorded-cut-select"
import {
  type CutHistory,
  type MaterialType,
  type PartCustomDimensions,
} from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { buildAndUploadCutPdf } from "./_components/cut-history-pdf"
import type { LayoutModel } from "./_components/layout-model"
import { CutLoader } from "./_components/cut-loader"
import { RollLoader } from "./_components/roll-loader"
import { JobLoader } from "./_components/job-loader"
import type { JobFullDetail, Roll } from "@/src/infrastructure/models/supabase"
import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import { strategyFor } from "./_components/bin-allocation-strategy"
import { templateToPart } from "./_components/template-to-part"
import { usePackJob } from "./_components/use-pack-job"
import { ReusableOffcutsCard } from "./_components/reusable-offcuts-card"
import {
  MAX_SHEETS,
  estimateSheetCount,
  estimateTotalPartAreaSqIn,
} from "./_components/auto-fill-bin-allocator"
import type { Bin, Part } from "@/src/application/packing/types"

// Constants

const DEMO_STOCK: StockConfig = {
  width: 96,
  length: 48,
  material: "",
  thickness: 0.5,
  kerf: DEFAULT_KERF_IN,
}

// Build-time gate for the AABB / scrap-rect debug overlays. Next.js
// inlines this comparison and SWC dead-code-eliminates the toggle UI
// + overlay paint code from production bundles.
const IS_DEV = process.env.NODE_ENV === "development"

// Helpers

function finiteOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null
}

function buildFrozenLayoutInputSignature(
  stockWidth: number,
  stockLength: number,
  stockKerf: number,
  templates: readonly PartTemplate[],
  cutDirection: SimpleCutDirection
): string {
  return JSON.stringify({
    stockWidth,
    stockLength,
    stockKerf,
    cutDirection,
    templates: templates.map((template) => ({
      partType: template.partType,
      quantity: template.quantity ?? 1,
      width: finiteOrNull(template.width),
      length: finiteOrNull(template.length),
      diameter: finiteOrNull(template.diameter),
      height: finiteOrNull(template.height),
      topWidth: finiteOrNull(template.topWidth),
      bottomWidth: finiteOrNull(template.bottomWidth),
      innerRadius: finiteOrNull(template.innerRadius),
      outerRadius: finiteOrNull(template.outerRadius),
      arcDegrees: finiteOrNull(template.arcDegrees),
      partNumber: template.partNumber ?? null,
    })),
  })
}

function LayoutLabel() {
  return <Ruler className="h-4 w-4 text-slate-500" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line max-lines-per-function
function CutPlannerPageInner() {
  const [presetParts, setPresetParts] = useState<PartTemplate[]>([])
  const [uploadedParts, setUploadedParts] = useState<PartTemplate[]>([])
  const [cutDirection, setCutDirection] = useState<SimpleCutDirection>("vertical_split")
  const [stock, setStock] = useState(DEMO_STOCK)
  const [cutMetrics, setCutMetrics] = useState<SimpleCutMetrics | null>(null)
  // LayoutModel[] emitted by NestingVisualizer — used by cut-history-pdf
  // to render vector shapes instead of scraping DOM SVG.
  const [layouts, setLayouts] = useState<LayoutModel[]>([])
  const [frozenLayouts, setFrozenLayouts] = useState<LayoutModel[] | null>(null)
  const [frozenLayoutInputSignature, setFrozenLayoutInputSignature] = useState<string | null>(null)
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

  // Dev-only diagnostic overlays painted on top of the auto-nest SVG.
  // The state is harmless in prod (default-false, the UI that flips it
  // and the renderer's overlay branch are both gated on `IS_DEV`).
  const [debugOverlays, setDebugOverlays] = useState<DebugOverlays>({
    showAabb: false,
    showScrapRects: false,
  })

  // Pack-gate: the Graph card shows an empty sheet (and the
  // visualizer skips its TS preview generators + Rust optimizer)
  // until the operator presses **Pack**. Any change to parts,
  // stock, or cut-direction resets the gate to `idle` so the
  // operator has to re-pack against the current inputs — this kills
  // the old live-preview churn that nudged operators into cutting
  // before their inputs had settled.
  const packGate = usePackGate()
  const { invalidate: invalidatePackGate, requestPack, status: packGateStatus } = packGate

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
      // Kerf is a first-class column on cut_history; read it back so
      // re-packing the saved cut uses the same clearance that was
      // recorded. Pre-kerf rows DEFAULT to 0.125 server-side, so the
      // nullish guard is purely defensive against a stale client cache.
      setStock({
        width: cut.cut_width,
        length: cut.cut_length,
        thickness: cut.cut_thickness,
        material: materialName,
        costPerSqft: cut.cost_per_sqft ?? undefined,
        materialTypeId: matchedMt?.id,
        kerf: cut.kerf ?? DEFAULT_KERF_IN,
      })

      // 2. Reconstruct part templates (delegated to a pure helper so the
      //    per-template partType / dims / quantity logic is unit-tested
      //    independently of React state). See `cut-load-utils.ts`.
      const {
        templates,
        primaryPartType,
        perTemplatePartTypes,
        customDimensions,
        perTemplateQuantities,
        sizeTexts,
        frozenLayouts: restoredLayouts,
      } = buildTemplatesFromCutRecord(cut)
      const nextCutDirection = getDefaultCutDirection(primaryPartType)

      // 3. Apply — clear uploaded parts so loaded config is the only source
      setUploadedParts([])
      setPresetParts(templates)
      setCutDirection(nextCutDirection)
      setFrozenLayouts(restoredLayouts)
      setFrozenLayoutInputSignature(
        restoredLayouts
          ? buildFrozenLayoutInputSignature(
              cut.cut_width,
              cut.cut_length,
              cut.kerf ?? DEFAULT_KERF_IN,
              templates,
              nextCutDirection
            )
          : null
      )

      // 4. Signal PresetDimensionSelector to select matching checkboxes.
      //    Pass stored dimension data + per-template partTypes so the
      //    selector can re-check the right boxes across multiple tabs
      //    (issue #126: a saved trapezoid+rectangle cut needs both
      //    types' checkboxes restored, not just the primary type's).
      setLoadedSelection({
        partType: primaryPartType,
        labels: sizeTexts,
        nonce: Date.now(),
        customDimensions: customDimensions ?? undefined,
        perTemplateQuantities: perTemplateQuantities ?? undefined,
        perTemplatePartTypes,
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
        kerf: DEFAULT_KERF_IN,
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

  // CutLoader's `onLoad` needs a stable identity — otherwise the
  // inline arrow creates a new function on every parent render, and
  // CutLoader's effect (whose deps include `onLoad`) re-fires on
  // every render. Combined with the preset-selector cascade that
  // `handleLoadCut` kicks off, this feeds the >50-render sentinel.
  // Manual cuts are intercepted here and bounced to Free-roam because
  // Auto-nest's `handleLoadCut` can't meaningfully parse layout_json.
  const handleCutLoaderLoad = useCallback(
    (cut: CutHistory) => {
      if (cut.source === "manual") {
        window.location.href = `/dashboard/cutting-engine/free-roam?loadCut=${cut.id}`
        return
      }
      handleLoadCut(cut)
      setLoadedFromHistory(true)
    },
    [handleLoadCut]
  )

  // ── Other handlers ────────────────────────────────────────────────────────
  const handleTemplateApply = useCallback((templates: PartTemplate[]) => {
    setPresetParts(templates)
    setCutDirection(getDefaultCutDirection(templates[0]?.partType ?? "rectangle"))
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
  const activeStockPreset = STOCK_PRESETS.find(
    (preset) => preset.width === stock.width && preset.length === stock.length
  )?.id
  const currentFrozenLayoutInputSignature = useMemo(
    () =>
      buildFrozenLayoutInputSignature(
        stock.width,
        stock.length,
        stock.kerf,
        selectedTemplates,
        cutDirection
      ),
    [stock.width, stock.length, stock.kerf, selectedTemplates, cutDirection]
  )
  const activeFrozenLayouts =
    frozenLayouts && currentFrozenLayoutInputSignature === frozenLayoutInputSignature
      ? frozenLayouts
      : undefined
  // Save Cut button visibility belt: only show when a real layout is
  // on screen, either restored from cut history or freshly packed.
  // Pairs with the `setCutMetrics(null)` reset below — even if metrics
  // ever lag the gate, the button can't appear over an empty sheet.
  const hasRenderedLayout =
    (activeFrozenLayouts?.length ?? 0) > 0 ||
    (packGateStatus === "done" && layouts.length > 0)

  useEffect(() => {
    if (!frozenLayouts || !frozenLayoutInputSignature) return
    if (currentFrozenLayoutInputSignature === frozenLayoutInputSignature) return
    setFrozenLayouts(null)
    setFrozenLayoutInputSignature(null)
    setLayouts([])
    setCutMetrics(null)
  }, [frozenLayouts, frozenLayoutInputSignature, currentFrozenLayoutInputSignature])

  // ── Rust pack pipeline (page-level) ───────────────────────────────────────
  // The page builds canonical Parts + Bins and calls the Rust autonester via
  // `usePackJob`. The visualizer becomes a thin LayoutModel renderer.

  const allocator = useMemo(() => strategyFor("autoFill"), [])
  const [autoBoost, setAutoBoost] = useState(0)

  const packParts = useMemo<Part[]>(
    () =>
      selectedTemplates
        .map((t) => templateToPart(t, tagByTemplateId.get(t.id)))
        .filter((p): p is Part => p !== null),
    [selectedTemplates, tagByTemplateId]
  )

  const packBins = useMemo<Bin[]>(
    () => allocator.allocate({ stock, templates: selectedTemplates, manualBoost: autoBoost }),
    [allocator, stock, selectedTemplates, autoBoost]
  )

  const {
    layouts: packLayouts,
    isPacking,
    packError,
  } = usePackJob({
    bins: packBins,
    parts: packParts,
    clearance: stock.kerf,
    templates: selectedTemplates,
    tagByShapeId: tagByTemplateId,
    enabled: packGateStatus === "done",
  })

  // ── Auto-boost on overflow ────────────────────────────────────────────────
  // If Rust reports overflow, bump the bin count and let the gate-driven
  // re-pack happen silently. Caps at MAX_SHEETS. `lastBoostedLayoutsRef`
  // prevents a re-pack from chain-reacting if the same layouts ref re-enters
  // the effect (e.g. via React strict-mode double-invoke).
  const totalOverflow = useMemo(
    () => (packLayouts ?? []).reduce((s, l) => s + l.overflowCount, 0),
    [packLayouts]
  )
  const capToastFiredRef = useRef(false)
  const lastBoostedLayoutsRef = useRef<LayoutModel[] | null>(null)

  // Reset the pack gate to `idle` whenever the inputs the visualizer
  // packs against change. The signature already encodes stock dims,
  // selected templates, cut direction, and ratios — so this fires
  // exactly when an operator edit invalidates the previous pack.
  // Also clear `cutMetrics` here: the visualizer's metrics-emit
  // effect early-returns when its `activeLayouts` becomes empty, so
  // without this reset the prior pack's metrics would linger and the
  // Save Cut button would stay visible against an empty sheet.
  useEffect(() => {
    invalidatePackGate()
    setCutMetrics(null)
  }, [currentFrozenLayoutInputSignature, invalidatePackGate])

  // Reset auto-boost + cap-toast tracking on any input change. Each new
  // pack starts fresh from the heuristic estimate.
  useEffect(() => {
    setAutoBoost(0)
    capToastFiredRef.current = false
    lastBoostedLayoutsRef.current = null
  }, [currentFrozenLayoutInputSignature])

  // Auto-boost effect: when Rust reports overflow, bump bin count.
  useEffect(() => {
    if (totalOverflow === 0 || !packLayouts) return
    if (lastBoostedLayoutsRef.current === packLayouts) return
    if (packBins.length >= MAX_SHEETS) {
      if (!capToastFiredRef.current) {
        toast.warning(
          `${totalOverflow} part${totalOverflow === 1 ? "" : "s"} couldn't fit on ${MAX_SHEETS} sheets`,
          { description: "Reduce part count, use larger stock, or split the job." }
        )
        capToastFiredRef.current = true
      }
      lastBoostedLayoutsRef.current = packLayouts
      return
    }
    const totalRequestedArea = estimateTotalPartAreaSqIn(selectedTemplates)
    const totalRequestedQty = selectedTemplates.reduce((s, t) => s + Math.max(1, t.quantity), 0)
    const avgPartArea = totalRequestedQty > 0 ? totalRequestedArea / totalRequestedQty : 0
    const overflowArea = totalOverflow * avgPartArea
    const additionalSheets = Math.max(
      1,
      estimateSheetCount(overflowArea, stock.width, stock.length) - 1
    )
    lastBoostedLayoutsRef.current = packLayouts
    setAutoBoost((b) => b + additionalSheets)
  }, [totalOverflow, packLayouts, selectedTemplates, stock.width, stock.length, packBins.length])

  // Surface any pack errors via a toast so the operator isn't left staring at
  // an empty card with no feedback.
  useEffect(() => {
    if (!packError) return
    toast.error("Pack failed", { description: packError })
  }, [packError])

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
        kerf: stock.kerf,
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
        // Auto-nest layout snapshot — stores per-template quantities
        // (cut_amount is a scalar and can't represent multi-template
        // cuts) + the frozen multi-sheet layouts from this pack run so
        // a reopen can restore the exact geometry rather than
        // re-packing from scratch. Field is optional server-side so a
        // missing column (old DBs) doesn't break the insert.
        layout_json: {
          version: 1,
          kind: "auto",
          perTemplateQuantities: selectedTemplates.map((t) => t.quantity ?? 1),
          // Issue #126: persist per-template partType so mixed-shape
          // cuts (e.g. trapezoid + rectangle) round-trip exactly. Built
          // from the same `selectedTemplates` array as the other
          // per-template fields so indices stay aligned.
          perTemplatePartTypes: selectedTemplates.map((t) => t.partType),
          layouts: layouts.length > 0 ? layouts : undefined,
        },
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
    <div className="space-y-6">
      <RollLoader onLoad={handleLoadRoll} />
      <JobLoader onLoad={handleLoadJob} />
      {sourceJob && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Cutting for <strong className="font-mono">{sourceJob.job_number}</strong>
            {" — "}
            {sourceJob.name}
            {sourceJob.customer_name ? (
              <span className="text-blue-700 dark:text-blue-400">
                {" · "}
                {sourceJob.customer_name}
              </span>
            ) : null}
            . This cut will link back to the job's Cuts Recorded panel.
          </span>
          <button
            type="button"
            aria-label="Clear job"
            onClick={() => setSourceJob(null)}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <CutLoader onLoad={handleCutLoaderLoad} />

      {loadedFromHistory && (
        <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">
            Cut loaded from history — all fields are editable. Adjust and click{" "}
            <strong>Save Cut</strong> to record a new entry.
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
            Cutting Engine
          </Badge>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-300">
              Cutting Engine
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Select a finished profile, choose the standard size, set the cut count, and preview
              the nested cut sheet for rectangles, strips, wraps, spreads, and panel layouts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:shrink-0">
          <RecordedCutSelect onLoad={handleLoadCut} refreshKey={cutListRefreshKey} />
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
                const tag = tagByTemplateId.get(part.id)
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
        materialTypes={materialTypes}
      />

      <PresetDimensionSelector
        onApply={handleTemplateApply}
        rollWidth={stock.width}
        rollLength={stock.length}
        tagMap={tagByTemplateId}
        loadedSelection={loadedSelection}
      />

      {selectedTemplates.length > 0 && selectedTemplate ? (
        <>
          <CutConfigCard
            selectedTemplate={selectedTemplate}
            selectedTemplates={selectedTemplates}
            cutDirection={cutDirection}
            setCutDirection={setCutDirection}
            requestedSqFt={requestedSqFt}
          />

          <Card className="border border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <LayoutLabel />
                  4. Graph
                </CardTitle>
                <div className="flex items-center gap-2">
                  {IS_DEV && (
                    <DebugOverlayToggles
                      debugOverlays={debugOverlays}
                      setDebugOverlays={setDebugOverlays}
                    />
                  )}
                  {packGateStatus !== "done" && !activeFrozenLayouts && (
                    <Button size="sm" onClick={requestPack} disabled={packGateStatus === "packing"}>
                      {packGateStatus === "packing" ? "Packing…" : "Pack"}
                    </Button>
                  )}
                  {hasRenderedLayout && cutMetrics !== null && cutMetrics.partsCompleted > 0 && (
                    <Button size="sm" onClick={handleRecordCut} disabled={isRecordingCut}>
                      <Scissors className="mr-1.5 h-4 w-4" />
                      {isRecordingCut ? "Saving…" : "Save Cut"}
                    </Button>
                  )}
                </div>
              </div>
              <CardDescription>
                {packGateStatus === "done" || activeFrozenLayouts
                  ? "The graph shows the actual cut pieces placed on the stock, with reusable offcut in amber and waste in red."
                  : "Pick your parts and stock above, then press Pack to generate the layout. Reusable offcut renders in amber, waste in red."}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <NestingVisualizer
                defaultRollWidth={stock.width}
                defaultRollLength={stock.length}
                defaultCutWidth={selectedTemplate.width ?? selectedTemplate.diameter ?? 24}
                defaultCutHeight={selectedTemplate.length ?? selectedTemplate.height ?? 24}
                defaultQty={safeQuantity}
                onMetricsChange={setCutMetrics}
                onLayoutChange={setLayouts}
                layouts={packLayouts ?? []}
                frozenLayouts={activeFrozenLayouts}
                packGateStatus={
                  isPacking && (!packLayouts || packLayouts.length === 0)
                    ? "packing"
                    : packGateStatus
                }
                isPacking={isPacking}
                debugOverlays={debugOverlays}
              />
            </CardContent>
          </Card>

          <ReusableOffcutsCard layouts={activeFrozenLayouts ?? packLayouts ?? []} />
        </>
      ) : (
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <LayoutLabel />
                4. Graph
              </CardTitle>
              {IS_DEV && (
                <div className="flex items-center gap-2">
                  <DebugOverlayToggles
                    debugOverlays={debugOverlays}
                    setDebugOverlays={setDebugOverlays}
                  />
                </div>
              )}
            </div>
            <CardDescription>
              The loaded stock sheet — no cuts placed yet. Pick a part above to start nesting onto
              it; the layout stays put.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NestingVisualizer
              defaultRollWidth={stock.width}
              defaultRollLength={stock.length}
              defaultCutWidth={Math.max(1, stock.width / 4)}
              defaultCutHeight={Math.max(1, stock.length / 8)}
              defaultQty={0}
              layouts={[]}
              debugOverlays={debugOverlays}
            />
            <div className="mt-4 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 text-xs dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
              <Shapes className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                Pick a preset or upload a cut list to start nesting parts onto this sheet.
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function CutPlannerPage() {
  return <CutPlannerPageInner />
}
