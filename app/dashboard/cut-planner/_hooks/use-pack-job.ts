"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  GreedyPackRequest,
  GreedyWorkerOutbound,
} from "@/nesting/greedy-pack-types"
import type {
  NfpPackRequest,
  NfpWorkerOutbound,
} from "@/nesting/nfp-pack-types"
import type {
  MultiSheetResult,
  SheetPreview,
  SimplePartPreview,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"
import { computeFabricationScore } from "@/app/dashboard/cut-planner/_components/nesting-preview-builders"

export type PackJobStatus = "idle" | "packing" | "done" | "error"

export interface PackJobProgress {
  label: string
  percent: number
  detail?: string
}

export interface PackJobResult {
  multiSheet: MultiSheetResult
}

export interface PackInput {
  specs: SimplePartSpec[]
  rollWidth: number
  rollLength: number
  fallbackCutWidth: number
  fallbackCutHeight: number
  fallbackQty: number
}

export interface UsePackJob {
  status: PackJobStatus
  progress: PackJobProgress
  result: PackJobResult | null
  error: string | null
  pack: (input: PackInput) => void
  cancel: () => void
  reset: () => void
}

type EngineState = {
  active: boolean
  done: boolean
  preview: SimplePartPreview | null
  percent: number
  detail?: string
}

const INITIAL_PROGRESS: PackJobProgress = { label: "Ready", percent: 0 }
const initialEngineState = (): EngineState => ({
  active: false,
  done: false,
  preview: null,
  percent: 0,
})

function buildMultiSheet(
  greedy: SimplePartPreview | null,
  nfp: SimplePartPreview | null,
  rollWidth: number,
  rollLength: number
): MultiSheetResult {
  const sheets: SheetPreview[] = []
  const push = (preview: SimplePartPreview, idx: number) => {
    sheets.push({ sheetIndex: idx, preview, isPartial: preview.overflowUnits > 0 })
  }
  if (greedy) push(greedy, sheets.length)
  if (nfp) push(nfp, sheets.length)

  const totalUnitsCompleted = sheets.reduce((s, sh) => s + sh.preview.unitsCompleted, 0)
  const totalUsedArea = sheets.reduce((s, sh) => s + sh.preview.usedArea, 0)
  const totalReusableArea = sheets.reduce((s, sh) => s + sh.preview.reusableArea, 0)
  const totalScrapArea = sheets.reduce((s, sh) => s + sh.preview.scrapArea, 0)
  const remainingOverflow = sheets.reduce((s, sh) => s + sh.preview.overflowUnits, 0)
  const fabScores = sheets.map(
    (sh) =>
      sh.preview.fabricationScore ??
      computeFabricationScore(sh.preview, rollWidth, rollLength).score
  )
  const avgFabScore =
    fabScores.length > 0 ? Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length) : 0

  return {
    sheets,
    totalUnitsCompleted,
    totalUsedArea,
    totalReusableArea,
    totalScrapArea,
    totalStockArea: rollWidth * rollLength * sheets.length,
    remainingOverflow,
    avgFabScore,
  }
}

export function usePackJob(): UsePackJob {
  const greedyWorkerRef = useRef<Worker | null>(null)
  const nfpWorkerRef = useRef<Worker | null>(null)
  const currentJobIdRef = useRef<string | null>(null)
  const greedyStateRef = useRef<EngineState>(initialEngineState())
  const nfpStateRef = useRef<EngineState>(initialEngineState())

  const [status, setStatus] = useState<PackJobStatus>("idle")
  const [progress, setProgress] = useState<PackJobProgress>(INITIAL_PROGRESS)
  const [result, setResult] = useState<PackJobResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rollDims, setRollDims] = useState<{ width: number; length: number }>({
    width: 0,
    length: 0,
  })

  const recomputeAggregate = useCallback(() => {
    const g = greedyStateRef.current
    const n = nfpStateRef.current
    const active = [g, n].filter((e) => e.active)
    if (active.length === 0) return

    const pct =
      active.reduce((s, e) => s + (e.done ? 100 : e.percent), 0) / active.length
    const detail = active.map((e) => e.detail).filter(Boolean).join(" · ") || undefined
    const label =
      g.active && n.active
        ? "Packing all shapes"
        : g.active
          ? g.done
            ? "Finishing up"
            : "Packing shapes"
          : n.done
            ? "Finishing up"
            : "Packing rectangles"
    setProgress({ label, percent: pct, detail })

    if (active.every((e) => e.done)) {
      const multiSheet = buildMultiSheet(
        g.preview,
        n.preview,
        rollDims.width,
        rollDims.length
      )
      setResult({ multiSheet })
      setStatus("done")
      currentJobIdRef.current = null
    }
  }, [rollDims.width, rollDims.length])

  const ensureGreedyWorker = useCallback((): Worker => {
    if (greedyWorkerRef.current) return greedyWorkerRef.current
    const worker = new Worker(new URL("@/nesting/greedy-pack.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<GreedyWorkerOutbound>) => {
      const msg = event.data
      if (msg.jobId !== currentJobIdRef.current) return
      if (msg.type === "progress") {
        greedyStateRef.current = {
          ...greedyStateRef.current,
          percent: msg.stage === "starting" ? 10 : msg.stage === "packing" ? 60 : 95,
          detail: msg.stage === "packing" ? "greedy" : undefined,
        }
        recomputeAggregate()
      } else if (msg.type === "done") {
        greedyStateRef.current = {
          ...greedyStateRef.current,
          done: true,
          percent: 100,
          preview: msg.preview,
        }
        recomputeAggregate()
      } else if (msg.type === "error") {
        setError(msg.message)
        setStatus("error")
        currentJobIdRef.current = null
      }
    })
    worker.addEventListener("error", (event) => {
      setError(event.message || "Greedy worker error")
      setStatus("error")
      currentJobIdRef.current = null
    })
    greedyWorkerRef.current = worker
    return worker
  }, [recomputeAggregate])

  const ensureNfpWorker = useCallback((): Worker => {
    if (nfpWorkerRef.current) return nfpWorkerRef.current
    const worker = new Worker(new URL("@/nesting/nfp-pack.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<NfpWorkerOutbound>) => {
      const msg = event.data
      if (msg.jobId !== currentJobIdRef.current) return
      if (msg.type === "progress") {
        const detail =
          msg.generation != null
            ? `gen ${msg.generation}${msg.placedSoFar != null ? `, ${msg.placedSoFar} placed` : ""}`
            : undefined
        nfpStateRef.current = {
          ...nfpStateRef.current,
          percent: msg.percent,
          detail,
        }
        recomputeAggregate()
      } else if (msg.type === "done") {
        nfpStateRef.current = {
          ...nfpStateRef.current,
          done: true,
          percent: 100,
          preview: msg.preview,
        }
        recomputeAggregate()
      } else if (msg.type === "error") {
        setError(msg.message)
        setStatus("error")
        currentJobIdRef.current = null
      }
    })
    worker.addEventListener("error", (event) => {
      setError(event.message || "NFP worker error")
      setStatus("error")
      currentJobIdRef.current = null
    })
    nfpWorkerRef.current = worker
    return worker
  }, [recomputeAggregate])

  useEffect(() => {
    return () => {
      greedyWorkerRef.current?.terminate()
      nfpWorkerRef.current?.terminate()
      greedyWorkerRef.current = null
      nfpWorkerRef.current = null
      currentJobIdRef.current = null
    }
  }, [])

  const pack = useCallback(
    (input: PackInput) => {
      if (input.specs.length === 0) return

      const rectSpecs = input.specs.filter((s) => s.partType === "rectangle")
      const otherSpecs = input.specs.filter((s) => s.partType !== "rectangle")
      if (rectSpecs.length === 0 && otherSpecs.length === 0) return

      const prevJobId = currentJobIdRef.current
      if (prevJobId) {
        greedyWorkerRef.current?.postMessage({ type: "cancel", jobId: prevJobId })
        nfpWorkerRef.current?.postMessage({ type: "cancel", jobId: prevJobId })
      }

      const jobId = `pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentJobIdRef.current = jobId

      greedyStateRef.current = { ...initialEngineState(), active: otherSpecs.length > 0 }
      nfpStateRef.current = { ...initialEngineState(), active: rectSpecs.length > 0 }

      setRollDims({ width: input.rollWidth, length: input.rollLength })
      setStatus("packing")
      setProgress({ label: "Starting", percent: 5 })
      setResult(null)
      setError(null)

      const shared = {
        jobId,
        rollWidth: input.rollWidth,
        rollLength: input.rollLength,
        fallbackCutWidth: input.fallbackCutWidth,
        fallbackCutHeight: input.fallbackCutHeight,
        fallbackQty: input.fallbackQty,
      }

      if (otherSpecs.length > 0) {
        const worker = ensureGreedyWorker()
        const req: GreedyPackRequest = { type: "pack", specs: otherSpecs, ...shared }
        worker.postMessage(req)
      }
      if (rectSpecs.length > 0) {
        const worker = ensureNfpWorker()
        const req: NfpPackRequest = { type: "pack", specs: rectSpecs, ...shared }
        worker.postMessage(req)
      }
    },
    [ensureGreedyWorker, ensureNfpWorker]
  )

  const cancel = useCallback(() => {
    const jobId = currentJobIdRef.current
    if (jobId) {
      greedyWorkerRef.current?.postMessage({ type: "cancel", jobId })
      nfpWorkerRef.current?.postMessage({ type: "cancel", jobId })
    }
    currentJobIdRef.current = null
    greedyStateRef.current = initialEngineState()
    nfpStateRef.current = initialEngineState()
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
  }, [])

  const reset = useCallback(() => {
    currentJobIdRef.current = null
    greedyStateRef.current = initialEngineState()
    nfpStateRef.current = initialEngineState()
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
    setResult(null)
    setError(null)
  }, [])

  return useMemo(
    () => ({ status, progress, result, error, pack, cancel, reset }),
    [status, progress, result, error, pack, cancel, reset]
  )
}
