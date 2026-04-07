// NFP background optimizer hook for NestingVisualizer
// Extracted from NestingVisualizer.tsx

import { useState, useRef, useEffect, useMemo } from "react"
import { NFPSolver } from "@/lib/nesting/nfp-solver"
import type { NestingInput, NestingPart, NestingResult } from "@/lib/nesting/types"
import type { SimplePartSpec, PreviewItem } from "./nesting-visualizer-types"
import { shouldAutoOptimizeInteractiveLayout } from "./nesting-preview-builders"
import { simplePartToNestingParts, nestingResultToPreviewItems } from "./nesting-nfp-helpers"

interface NFPOptimizerResult {
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  isOptimizing: boolean
  nfpError: string | null
}

export function useNfpOptimizer(
  simpleMode: boolean,
  activeSimpleSpecs: SimplePartSpec[],
  defaultCutWidth: number,
  defaultCutHeight: number,
  defaultQty: number,
  defaultRollWidth: number,
  defaultRollLength: number
): NFPOptimizerResult {
  const nfpSolverRef = useRef<NFPSolver | null>(null)
  const [optimizedResult, setOptimizedResult] = useState<NestingResult | null>(null)
  const [optimizedItems, setOptimizedItems] = useState<PreviewItem[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [nfpError, setNfpError] = useState<string | null>(null)

  const nfpInputKey = useMemo(
    () =>
      JSON.stringify({
        rw: defaultRollWidth,
        rl: defaultRollLength,
        sp: activeSimpleSpecs,
        cw: defaultCutWidth,
        ch: defaultCutHeight,
        q: defaultQty,
      }),
    [
      defaultRollWidth,
      defaultRollLength,
      activeSimpleSpecs,
      defaultCutWidth,
      defaultCutHeight,
      defaultQty,
    ]
  )

  // Clean up solver on unmount
  useEffect(() => {
    return () => {
      nfpSolverRef.current?.cancel()
    }
  }, [])

  useEffect(() => {
    if (!simpleMode) return
    queueMicrotask(() => {
      setOptimizedResult(null)
      setOptimizedItems(null)
      setIsOptimizing(false)
      setNfpError(null)
    })

    // STOPS CONE FROM RUNNING NFP RESOLVER
    // TODO: Understand what this even does, but in the mean time I will allow cones to run.
    // TODO: UNCOMMENT
    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) {
      console.log(
        "SHOULD OPTIMIZE?",
        shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs),
        activeSimpleSpecs
      )
      // return
    }

    const nestingParts: NestingPart[] = activeSimpleSpecs.flatMap((spec, i) =>
      simplePartToNestingParts(spec, defaultCutWidth, defaultCutHeight, i)
    )

    const totalRequestedPieces = nestingParts.reduce((sum, part) => sum + part.quantity, 0)
    const generations = totalRequestedPieces > 16 ? 10 : totalRequestedPieces > 8 ? 14 : 18
    const populationSize = totalRequestedPieces > 16 ? 4 : totalRequestedPieces > 8 ? 6 : 8

    const input: NestingInput = {
      binWidth: defaultRollWidth,
      binHeight: defaultRollLength,
      parts: nestingParts,
      spacing: 0.125,
      rotationSteps: 4,
      generations,
      populationSize,
      mutationRate: 0.2,
    }

    if (!nfpSolverRef.current) {
      nfpSolverRef.current = new NFPSolver()
    }

    let cancel: (() => void) | null = null
    // THIS IS WHERE THE NFP ALGORITHM IS TRIGGERED
    const timer = window.setTimeout(() => {
      console.log("RUNNING SOLVER", input)
      setIsOptimizing(true)
      cancel = nfpSolverRef.current!.solve(input, {
        onComplete: (result) => {
          const items = nestingResultToPreviewItems(
            result,
            nestingParts,
            activeSimpleSpecs,
            defaultCutWidth,
            defaultCutHeight
          )
          setOptimizedResult(result)
          setOptimizedItems(items.length > 0 ? items : null)
          setIsOptimizing(false)
        },
        onError: (msg) => {
          console.error("[NFP] Solver error:", msg)
          setNfpError(msg)
          setOptimizedResult(null)
          setOptimizedItems(null)
          setIsOptimizing(false)
        },
      })
    }, 220)

    return () => {
      window.clearTimeout(timer)
      cancel?.()
      setIsOptimizing(false)
    }
  }, [
    nfpInputKey,
    simpleMode,
    activeSimpleSpecs,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
    defaultRollLength,
    defaultRollWidth,
  ])

  return { optimizedResult, optimizedItems, isOptimizing, nfpError }
}
