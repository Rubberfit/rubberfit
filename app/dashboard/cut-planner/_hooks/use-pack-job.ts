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

function mergeMultiSheets(
  greedy: MultiSheetResult | null,
  nfp: MultiSheetResult | null
): MultiSheetResult | null {
  if (!greedy && !nfp) return null
  const ordered = [greedy, nfp].filter((m): m is MultiSheetResult => m !== null)
  const sheets: SheetPreview[] = []
  ordered.forEach((ms) => {
    ms.sheets.forEach((sheet) => {
      sheets.push({ ...sheet, sheetIndex: sheets.length })
    })
  })

  const totalUnitsCompleted = ordered.reduce((s, ms) => s + ms.totalUnitsCompleted, 0)
  const totalUsedArea = ordered.reduce((s, ms) => s + ms.totalUsedArea, 0)
  const totalReusableArea = ordered.reduce((s, ms) => s + ms.totalReusableArea, 0)
  const totalScrapArea = ordered.reduce((s, ms) => s + ms.totalScrapArea, 0)
  const totalStockArea = ordered.reduce((s, ms) => s + ms.totalStockArea, 0)
  const remainingOverflow = ordered.reduce((s, ms) => s + ms.remainingOverflow, 0)
  const fabScores = ordered.map((ms) => ms.avgFabScore).filter((n) => n > 0)
  const avgFabScore =
    fabScores.length > 0 ? Math.round(fabScores.reduce((a, b) => a + b, 0) / fabScores.length) : 0

  return {
    sheets,
    totalUnitsCompleted,
    totalUsedArea,
    totalReusableArea,
    totalScrapArea,
    totalStockArea,
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
      const multiSheet = mergeMultiSheets(g.multiSheet, n.multiSheet)
      if (multiSheet) setResult({ multiSheet })
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
