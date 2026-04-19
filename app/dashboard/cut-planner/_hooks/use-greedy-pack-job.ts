"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  GreedyPackRequest,
  GreedyPackStage,
  GreedyWorkerOutbound,
} from "@/nesting/greedy-pack-types"
import type { SimplePartPreview } from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"

export type GreedyPackStatus = "idle" | "packing" | "done" | "error"

export interface GreedyPackProgress {
  stage: GreedyPackStage
}

export interface GreedyPackResult {
  preview: SimplePartPreview
}

export interface UseGreedyPackJob {
  status: GreedyPackStatus
  progress: GreedyPackProgress
  result: GreedyPackResult | null
  error: string | null
  pack: (input: Omit<GreedyPackRequest, "type" | "jobId">) => void
  cancel: () => void
  reset: () => void
}

const INITIAL_PROGRESS: GreedyPackProgress = { stage: "starting" }

export function useGreedyPackJob(): UseGreedyPackJob {
  const workerRef = useRef<Worker | null>(null)
  const currentJobIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState<GreedyPackStatus>("idle")
  const [progress, setProgress] = useState<GreedyPackProgress>(INITIAL_PROGRESS)
  const [result, setResult] = useState<GreedyPackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL("@/nesting/greedy-pack.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<GreedyWorkerOutbound>) => {
      const msg = event.data
      if (msg.jobId !== currentJobIdRef.current) return
      if (msg.type === "progress") {
        setProgress({ stage: msg.stage })
      } else if (msg.type === "done") {
        setResult({ preview: msg.preview })
        setProgress({ stage: "done" })
        setStatus("done")
        currentJobIdRef.current = null
      } else if (msg.type === "error") {
        setError(msg.message)
        setStatus("error")
        currentJobIdRef.current = null
      }
    })
    worker.addEventListener("error", (event) => {
      setError(event.message || "Worker error")
      setStatus("error")
      currentJobIdRef.current = null
    })
    workerRef.current = worker
    return worker
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      currentJobIdRef.current = null
    }
  }, [])

  const pack = useCallback(
    (input: Omit<GreedyPackRequest, "type" | "jobId">) => {
      const worker = ensureWorker()
      const prevJobId = currentJobIdRef.current
      const jobId = `greedy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      if (prevJobId) {
        worker.postMessage({ type: "cancel", jobId: prevJobId })
      }

      currentJobIdRef.current = jobId
      setStatus("packing")
      setProgress(INITIAL_PROGRESS)
      setResult(null)
      setError(null)

      const request: GreedyPackRequest = { type: "pack", jobId, ...input }
      worker.postMessage(request)
    },
    [ensureWorker]
  )

  const cancel = useCallback(() => {
    const worker = workerRef.current
    const jobId = currentJobIdRef.current
    if (worker && jobId) worker.postMessage({ type: "cancel", jobId })
    currentJobIdRef.current = null
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
  }, [])

  const reset = useCallback(() => {
    currentJobIdRef.current = null
    setStatus("idle")
    setProgress(INITIAL_PROGRESS)
    setResult(null)
    setError(null)
  }, [])

  return { status, progress, result, error, pack, cancel, reset }
}
