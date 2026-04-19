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
  PreviewItem,
  RectLikePreview,
  SimplePartPreview,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"
import type { NestingInput, NestingResult } from "./types"
import { NFPSolver } from "./nfp-solver"
import type {
  NfpPackRequest,
  NfpWorkerInbound,
  NfpWorkerOutbound,
} from "./nfp-pack-types"

const ctx = self as unknown as DedicatedWorkerGlobalScope
const solver = new NFPSolver()
let currentJobId: string | null = null

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

async function handlePack(request: NfpPackRequest): Promise<void> {
  currentJobId = request.jobId

  post({
    type: "progress",
    jobId: request.jobId,
    stage: "starting",
    percent: 5,
  })

  const nestingParts = request.specs.flatMap((spec, i) =>
    simplePartToNestingParts(
      spec,
      request.fallbackCutWidth,
      request.fallbackCutHeight,
      i
    ).map((np) => ({
      ...np,
      originalSpec: {
        ...np.originalSpec,
        specIndex: i,
        partNumber: spec.partNumber,
      },
    }))
  )

  if (nestingParts.length === 0) {
    post({ type: "error", jobId: request.jobId, message: "No parts to pack" })
    return
  }

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

  post({
    type: "progress",
    jobId: request.jobId,
    stage: "solving",
    percent: 10,
  })

  let progressCount = 0
  let finalResult: NestingResult | null = null
  try {
    finalResult = await new Promise<NestingResult>((resolve, reject) => {
      solver.solve(input, {
        onProgress: (partial) => {
          if (currentJobId !== request.jobId) return
          progressCount++
          const pct = Math.min(85, 10 + (progressCount / generations) * 75)
          post({
            type: "progress",
            jobId: request.jobId,
            stage: "solving",
            percent: pct,
            generation: progressCount,
            placedSoFar: partial.placed,
          })
        },
        onComplete: (result) => resolve(result),
        onError: (message) => reject(new Error(message)),
      })
    })
  } catch (err) {
    if (currentJobId !== request.jobId) return
    post({
      type: "error",
      jobId: request.jobId,
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }

  if (currentJobId !== request.jobId || !finalResult) return

  post({
    type: "progress",
    jobId: request.jobId,
    stage: "finalizing",
    percent: 90,
  })

  const items = nestingResultToPreviewItems(
    finalResult,
    nestingParts,
    request.specs,
    request.fallbackCutWidth,
    request.fallbackCutHeight
  ).map((it, i) => {
    const placement = finalResult!.placements[i]
    const partIdBase = placement.partId.replace(/-\d+$/, "")
    const np = nestingParts.find((p) => p.id === partIdBase)
    return {
      ...it,
      specIndex: np?.sourceSpecIndex,
      partNumber: np?.originalSpec.partNumber as string | undefined,
    }
  })

  const requestedUnits = request.specs.reduce((s, spec) => s + Math.max(1, spec.quantity), 0)
  const preview = assemblePreview(
    finalResult,
    items,
    request.rollWidth,
    request.rollLength,
    requestedUnits
  )

  post({ type: "done", jobId: request.jobId, preview })
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
