"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  NfpPackRequest,
  NfpPackStage,
  NfpWorkerOutbound,
} from "@/nesting/nfp-pack-types"
import type { SimplePartPreview } from "@/app/dashboard/cut-planner/_components/nesting-visualizer-types"

export type NfpPackStatus = "idle" | "packing" | "done" | "error"

export interface NfpPackProgress {
  stage: NfpPackStage
  percent: number
  generation?: number
  placedSoFar?: number
}

export interface NfpPackResult {
  preview: SimplePartPreview
}

export interface UseNfpPackJob {
  status: NfpPackStatus
  progress: NfpPackProgress
  result: NfpPackResult | null
  error: string | null
  pack: (input: Omit<NfpPackRequest, "type" | "jobId">) => void
  cancel: () => void
  reset: () => void
}

const INITIAL_PROGRESS: NfpPackProgress = { stage: "starting", percent: 0 }

export function useNfpPackJob(): UseNfpPackJob {
  const workerRef = useRef<Worker | null>(null)
  const currentJobIdRef = useRef<string | null>(null)

  const [status, setStatus] = useState<NfpPackStatus>("idle")
  const [progress, setProgress] = useState<NfpPackProgress>(INITIAL_PROGRESS)
  const [result, setResult] = useState<NfpPackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ensureWorker = useCallback((): Worker => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL("@/nesting/nfp-pack.worker.ts", import.meta.url), {
      type: "module",
    })
    worker.addEventListener("message", (event: MessageEvent<NfpWorkerOutbound>) => {
      const msg = event.data
      if (msg.jobId !== currentJobIdRef.current) return
      if (msg.type === "progress") {
        setProgress({
          stage: msg.stage,
          percent: msg.percent,
          generation: msg.generation,
          placedSoFar: msg.placedSoFar,
        })
      } else if (msg.type === "done") {
        setResult({ preview: msg.preview })
        setProgress({ stage: "done", percent: 100 })
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
    (input: Omit<NfpPackRequest, "type" | "jobId">) => {
      const worker = ensureWorker()
      const prevJobId = currentJobIdRef.current
      const jobId = `nfp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      if (prevJobId) {
        worker.postMessage({ type: "cancel", jobId: prevJobId })
      }

      currentJobIdRef.current = jobId
      setStatus("packing")
      setProgress(INITIAL_PROGRESS)
      setResult(null)
      setError(null)

      const request: NfpPackRequest = { type: "pack", jobId, ...input }
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
