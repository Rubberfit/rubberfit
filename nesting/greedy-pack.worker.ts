/// <reference lib="webworker" />

import {
  computeMultiSheetPreviews,
  generateMultiPartPreview,
  generateSimplePartPreview,
} from "@/app/dashboard/cut-planner/_components/nesting-shape-previews-dispatch"
import type {
  MultiSheetResult,
  SimplePartPreview,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"
import type {
  GreedyPackRequest,
  GreedyWorkerInbound,
  GreedyWorkerOutbound,
} from "./greedy-pack-types"

const ctx = self as unknown as DedicatedWorkerGlobalScope
let currentJobId: string | null = null

const MAX_SHEETS = 4

function post(msg: GreedyWorkerOutbound): void {
  ctx.postMessage(msg)
}

function packSingle(spec: SimplePartSpec, request: GreedyPackRequest): SimplePartPreview {
  return generateSimplePartPreview(
    request.rollWidth,
    request.rollLength,
    spec,
    request.fallbackCutWidth,
    request.fallbackCutHeight,
    request.fallbackQty,
    false
  )
}

function packMulti(specs: SimplePartSpec[], request: GreedyPackRequest): SimplePartPreview {
  return generateMultiPartPreview(
    request.rollWidth,
    request.rollLength,
    specs,
    request.fallbackCutWidth,
    request.fallbackCutHeight,
    false
  )
}

function runPack(request: GreedyPackRequest): MultiSheetResult {
  if (request.specs.length === 0) {
    throw new Error("No parts to pack")
  }

  if (request.specs.length === 1) {
    const spec = request.specs[0]
    const basePreview = packSingle(spec, request)
    return computeMultiSheetPreviews(
      basePreview,
      request.rollWidth,
      request.rollLength,
      MAX_SHEETS,
      (qty) => packSingle({ ...spec, quantity: qty }, request)
    )
  }

  const basePreview = packMulti(request.specs, request)
  return computeMultiSheetPreviews(
    basePreview,
    request.rollWidth,
    request.rollLength,
    MAX_SHEETS,
    (_qty, remainingSpecs) => {
      const specs = remainingSpecs ?? request.specs
      // When overflow collapses to a single spec type, route to the single-part
      // generator so NFP rotation kicks in (multi-part fallback is shelf-packed,
      // which loses tight nesting for cones/trapezoids).
      if (specs.length === 1) return packSingle(specs[0], request)
      return packMulti(specs, request)
    },
    request.specs
  )
}

function handlePack(request: GreedyPackRequest): void {
  currentJobId = request.jobId
  post({ type: "progress", jobId: request.jobId, stage: "starting" })

  try {
    post({ type: "progress", jobId: request.jobId, stage: "packing" })
    const multiSheet = runPack(request)

    if (currentJobId !== request.jobId) return
    post({ type: "done", jobId: request.jobId, multiSheet })
  } catch (err) {
    if (currentJobId !== request.jobId) return
    post({
      type: "error",
      jobId: request.jobId,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function handleCancel(jobId: string): void {
  if (currentJobId === jobId) currentJobId = null
}

ctx.addEventListener("message", (event: MessageEvent<GreedyWorkerInbound>) => {
  const msg = event.data
  if (msg.type === "pack") handlePack(msg)
  else if (msg.type === "cancel") handleCancel(msg.jobId)
})
