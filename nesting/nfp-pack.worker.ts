/// <reference lib="webworker" />

import {
  simplePartToNestingParts,
  nestingResultToPreviewItems,
} from "@/app/dashboard/cut-planner/_components/nesting-nfp-helpers"
import {
  withWaste,
  computeFabricationScore,
} from "@/app/dashboard/cut-planner/_components/nesting-preview-builders"
import type {
  MultiSheetResult,
  PreviewItem,
  RectLikePreview,
  SheetPreview,
  SimplePartPreview,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"
import type { NestingInput, NestingPart, NestingResult } from "./types"
import { NFPSolver } from "./nfp-solver"
import type {
  NfpPackRequest,
  NfpWorkerInbound,
  NfpWorkerOutbound,
} from "./nfp-pack-types"

const ctx = self as unknown as DedicatedWorkerGlobalScope
const solver = new NFPSolver()
let currentJobId: string | null = null

const MAX_SHEETS = 4

function post(msg: NfpWorkerOutbound): void {
  ctx.postMessage(msg)
}

function assemblePreview(
  result: NestingResult,
  items: PreviewItem[],
  rollWidth: number,
  rollLength: number,
  requestedUnits: number
): SimplePartPreview {
  const placements = items.map((it) => ({
    x: it.x,
    y: it.y,
    width: it.width,
    height: it.height,
    flipped: it.flipped,
    rotated90: it.rotated90,
  }))

  const base: RectLikePreview = {
    renderShape: "rect",
    strategyName: "NFP Pack",
    strategyNote:
      result.overflow > 0
        ? `${result.placed} placed, ${result.overflow} did not fit`
        : `${result.placed} placed`,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [],
    requestedUnits,
    unitsCompleted: result.placed,
    overflowUnits: result.overflow,
    piecesShown: result.placed,
    piecesPerUnit: 1,
    usedArea: result.usedArea,
    wasteArea: 0,
    wastePct: 0,
    reusableArea: 0,
    scrapArea: 0,
    items,
    placements,
    occupiedWidth: result.occupiedWidth,
    occupiedHeight: result.occupiedHeight,
    offcutBands: [],
    scrapBands: [],
    label: "Packed",
  }

  const withBands = withWaste(base, rollWidth, rollLength)
  const fab = computeFabricationScore(withBands, rollWidth, rollLength)
  return { ...withBands, fabricationScore: fab.score, fabricationBreakdown: fab.breakdown }
}

function buildNestingParts(
  specs: SimplePartSpec[],
  fallbackCutWidth: number,
  fallbackCutHeight: number
): NestingPart[] {
  return specs.flatMap((spec, i) =>
    simplePartToNestingParts(spec, fallbackCutWidth, fallbackCutHeight, i).map((np) => ({
      ...np,
      originalSpec: {
        ...np.originalSpec,
        specIndex: i,
        partNumber: spec.partNumber,
      },
    }))
  )
}

async function solveOne(
  specs: SimplePartSpec[],
  request: NfpPackRequest,
  reportProgress: (pct: number, generation?: number, placedSoFar?: number) => void
): Promise<{ preview: SimplePartPreview; items: PreviewItem[]; placedBySpec: Map<number, number> }> {
  const nestingParts = buildNestingParts(specs, request.fallbackCutWidth, request.fallbackCutHeight)
  const totalQty = nestingParts.reduce((s, p) => s + p.quantity, 0)
  const generations = Math.min(18, Math.max(10, 8 + Math.floor(totalQty / 3)))
  const populationSize = Math.min(10, Math.max(4, 4 + Math.floor(totalQty / 4)))

  const input: NestingInput = {
    binWidth: request.rollWidth,
    binHeight: request.rollLength,
    parts: nestingParts,
    spacing: request.spacing ?? 0.125,
    rotationSteps: 4,
    generations,
    populationSize,
    mutationRate: 0.2,
  }

  let progressCount = 0
  const result = await new Promise<NestingResult>((resolve, reject) => {
    solver.solve(input, {
      onProgress: (partial) => {
        if (currentJobId !== request.jobId) return
        progressCount++
        reportProgress(
          Math.min(85, 10 + (progressCount / generations) * 75),
          progressCount,
          partial.placed
        )
      },
      onComplete: (r) => resolve(r),
      onError: (msg) => reject(new Error(msg)),
    })
  })

  const items = nestingResultToPreviewItems(
    result,
    nestingParts,
    specs,
    request.fallbackCutWidth,
    request.fallbackCutHeight
  ).map((it, i) => {
    const placement = result.placements[i]
    const partIdBase = placement.partId.replace(/-\d+$/, "")
    const np = nestingParts.find((p) => p.id === partIdBase)
    return {
      ...it,
      specIndex: np?.sourceSpecIndex,
      partNumber: np?.originalSpec.partNumber as string | undefined,
    }
  })

  const placedBySpec = new Map<number, number>()
  for (const it of items) {
    if (it.specIndex == null) continue
    placedBySpec.set(it.specIndex, (placedBySpec.get(it.specIndex) ?? 0) + 1)
  }

  const requestedUnits = specs.reduce((s, spec) => s + Math.max(1, spec.quantity), 0)
  const preview = assemblePreview(
    result,
    items,
    request.rollWidth,
    request.rollLength,
    requestedUnits
  )
  return { preview, items, placedBySpec }
}

function subtractPlaced(
  specs: SimplePartSpec[],
  placedBySpec: Map<number, number>
): SimplePartSpec[] {
  return specs
    .map((spec, i) => {
      const placed = placedBySpec.get(i) ?? 0
      const remaining = Math.max(0, (spec.quantity ?? 0) - placed)
      return remaining > 0 ? { ...spec, quantity: remaining } : null
    })
    .filter((s): s is SimplePartSpec => s !== null)
}

async function handlePack(request: NfpPackRequest): Promise<void> {
  currentJobId = request.jobId
  post({ type: "progress", jobId: request.jobId, stage: "starting", percent: 5 })

  if (request.specs.length === 0) {
    post({ type: "error", jobId: request.jobId, message: "No parts to pack" })
    return
  }

  post({ type: "progress", jobId: request.jobId, stage: "solving", percent: 10 })

  const sheets: SheetPreview[] = []
  let remaining = request.specs
  const stockArea = request.rollWidth * request.rollLength

  try {
    while (remaining.length > 0 && sheets.length < MAX_SHEETS) {
      const sheetIndex = sheets.length
      const { preview, placedBySpec } = await solveOne(remaining, request, (pct, gen, placed) => {
        const basePct = (sheetIndex * 90) / MAX_SHEETS
        const scaledPct = basePct + (pct * 90) / MAX_SHEETS / 100
        post({
          type: "progress",
          jobId: request.jobId,
          stage: "solving",
          percent: Math.min(90, scaledPct),
          generation: gen,
          placedSoFar: placed,
        })
      })

      if (currentJobId !== request.jobId) return
      if (preview.unitsCompleted === 0) break

      sheets.push({
        sheetIndex,
        preview,
        isPartial: preview.overflowUnits > 0,
      })

      remaining = subtractPlaced(remaining, placedBySpec)
    }
  } catch (err) {
    if (currentJobId !== request.jobId) return
    post({
      type: "error",
      jobId: request.jobId,
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (currentJobId !== request.jobId) return

  post({ type: "progress", jobId: request.jobId, stage: "finalizing", percent: 95 })

  const totalUnitsCompleted = sheets.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)
  const totalUsedArea = sheets.reduce((s, sh) => s + sh.preview.usedArea, 0)
  const totalReusableArea = sheets.reduce((s, sh) => s + sh.preview.reusableArea, 0)
  const totalScrapArea = sheets.reduce((s, sh) => s + sh.preview.scrapArea, 0)
  const remainingOverflow = remaining.reduce((s, spec) => s + Math.max(0, spec.quantity ?? 0), 0)
  const fabScores = sheets.map(
    (sh) =>
      sh.preview.fabricationScore ??
      computeFabricationScore(sh.preview, request.rollWidth, request.rollLength).score
  )
  const avgFabScore =
    fabScores.length > 0 ? Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length) : 0

  const multiSheet: MultiSheetResult = {
    sheets,
    totalUnitsCompleted,
    totalUsedArea,
    totalReusableArea,
    totalScrapArea,
    totalStockArea: stockArea * Math.max(1, sheets.length),
    remainingOverflow,
    avgFabScore,
  }

  post({ type: "done", jobId: request.jobId, multiSheet })
}

function handleCancel(jobId: string): void {
  if (currentJobId === jobId) {
    solver.cancel()
    currentJobId = null
  }
}

ctx.addEventListener("message", (event: MessageEvent<NfpWorkerInbound>) => {
  const msg = event.data
  if (msg.type === "pack") {
    handlePack(msg).catch((err) => {
      post({
        type: "error",
        jobId: msg.jobId,
        message: err instanceof Error ? err.message : String(err),
      })
    })
  } else if (msg.type === "cancel") {
    handleCancel(msg.jobId)
  }
})
