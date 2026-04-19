/// <reference lib="webworker" />

import {
  generateSimplePartPreview,
  generateMultiPartPreview,
} from "@/app/dashboard/cut-planner/_components/nesting-shape-previews-dispatch"
import type { SimplePartPreview } from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"
import type {
  GreedyPackRequest,
  GreedyWorkerInbound,
  GreedyWorkerOutbound,
} from "./greedy-pack-types"

const ctx = self as unknown as DedicatedWorkerGlobalScope
let currentJobId: string | null = null

function post(msg: GreedyWorkerOutbound): void {
  ctx.postMessage(msg)
}

function runPack(request: GreedyPackRequest): SimplePartPreview {
  if (request.specs.length === 0) {
    throw new Error("No parts to pack")
  }

  if (request.specs.length === 1) {
    const spec = request.specs[0]
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

  return generateMultiPartPreview(
    request.rollWidth,
    request.rollLength,
    request.specs,
    request.fallbackCutWidth,
    request.fallbackCutHeight,
    false
  )
}

function handlePack(request: GreedyPackRequest): void {
  currentJobId = request.jobId
  post({ type: "progress", jobId: request.jobId, stage: "starting" })

  try {
    post({ type: "progress", jobId: request.jobId, stage: "packing" })
    const preview = runPack(request)

    if (currentJobId !== request.jobId) return
    post({ type: "done", jobId: request.jobId, preview })
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
