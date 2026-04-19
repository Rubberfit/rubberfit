"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  GreedyPackRequest,
  GreedyWorkerOutbound,
} from "@/nesting/greedy-pack-types"
import type {
  MultiSheetResult,
  SimplePartSpec,
} from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"

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
  multiSheet: MultiSheetResult | null
  percent: number
  detail?: string
}

const INITIAL_PROGRESS: PackJobProgress = { label: "Ready", percent: 0 }
const initialEngineState = (): EngineState => ({
  active: false,
  done: false,
  multiSheet: null,
  percent: 0,
})

export function usePackJob(): UsePackJob {
  const greedyWorkerRef = useRef<Worker | null>(null)
  const currentJobIdRef = useRef<string | null>(null)
  const greedyStateRef = useRef<EngineState>(initialEngineState())

  const [status, setStatus] = useState<PackJobStatus>("idle")
  const [progress, setProgress] = useState<PackJobProgress>(INITIAL_PROGRESS)
  const [result, setResult] = useState<PackJobResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recomputeAggregate = useCallback(() => {
    const g = greedyStateRef.current
    if (!g.active) return

    const pct = g.done ? 100 : g.percent
    const label = g.done ? "Finishing up" : "Packing shapes"
    setProgress({ label, percent: pct, detail: g.detail })

    if (g.done) {
      if (g.multiSheet) setResult({ multiSheet: g.multiSheet })
      setStatus("done")
      currentJobIdRef.current = null
    }
  }, [])

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
          multiSheet: msg.multiSheet,
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

  useEffect(() => {
    return () => {
      greedyWorkerRef.current?.terminate()
      greedyWorkerRef.current = null
      currentJobIdRef.current = null
    }
  }, [])

  const pack = useCallback(
    (input: PackInput) => {
      if (input.specs.length === 0) return

      const prevJobId = currentJobIdRef.current
      if (prevJobId) {
        greedyWorkerRef.current?.postMessage({ type: "cancel", jobId: prevJobId })
      }

      const jobId = `pack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentJobIdRef.current = jobId

      // Route all specs through the greedy worker — it dispatches internally to
      // the right algorithm per shape (MaxRects guillotine for multi-spec
      // rectangles, greedyNfpPack for single-spec rectangles/cones/trapezoids,
      // mixed-NFP for cone/trapezoid mixes).
      greedyStateRef.current = { ...initialEngineState(), active: true }

      setStatus("packing")
      setProgress({ label: "Starting", percent: 5 })
      setResult(null)
      setError(null)

      const worker = ensureGreedyWorker()
      const req: GreedyPackRequest = {
        type: "pack",
        jobId,
        specs: input.specs,
        rollWidth: input.rollWidth,
        rollLength: input.rollLength,
        fallbackCutWidth: input.fallbackCutWidth,
        fallbackCutHeight: input.fallbackCutHeight,
        fallbackQty: input.fallbackQty,
      }
      worker.postMessage(req)
    },
    [ensureGreedyWorker]
  )

  const cancel = useCallback(() => {
    const jobId = currentJobIdRef.current
    if (jobId) {
      greedyWorkerRef.current?.postMessage({ type: "cancel", jobId })
    }
    currentJobIdRef.current = null
    greedyStateRef.current = initialEngineState()
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
  }, [])

  const reset = useCallback(() => {
    currentJobIdRef.current = null
    greedyStateRef.current = initialEngineState()
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
