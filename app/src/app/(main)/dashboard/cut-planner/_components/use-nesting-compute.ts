// Custom hook for NestingVisualizer computation
// Extracts state management, NFP solving, and strategy scoring from the main component

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { NFPSolver } from "@/lib/nesting/nfp-solver"
import type { NestingInput, NestingPart, NestingResult } from "@/lib/nesting/types"

import type {
  ShapeType,
  GrainDir,
  DiagDir,
  ScoredStrategy,
  NestingVisualizerProps,
  SimplePartPreview,
  PreviewItem,
} from "./nesting-visualizer-types"

import { getStrategies, scoreStrat } from "./nesting-layout-utils"

import { generateSimplePartPreview, generateMultiPartPreview } from "./nesting-shape-previews"

import { shouldAutoOptimizeInteractiveLayout } from "./nesting-preview-builders"

import { simplePartToNestingParts, nestingResultToPreviewItems } from "./nesting-nfp-helpers"

interface UseNestingComputeResult {
  // shared state
  shape: ShapeType
  setShape: (s: ShapeType) => void
  rollW: number
  setRollW: (v: number) => void
  rollL: number
  setRollL: (v: number) => void
  // rect mode
  cutW: number
  setCutW: (v: number) => void
  cutH: number
  setCutH: (v: number) => void
  qty: number
  setQty: (v: number) => void
  diagAng: number
  setDiagAng: (v: number) => void
  ddir: DiagDir
  setDdir: (d: DiagDir) => void
  grain: GrainDir
  setGrain: (g: GrainDir) => void
  activeId: string
  setActiveId: (id: string) => void
  activeStep: number
  setActiveStep: (s: number) => void
  scored: ScoredStrategy[]
  // circle
  diam: number
  setDiam: (v: number) => void
  // cone
  innerR: number
  setInnerR: (v: number) => void
  outerR: number
  setOuterR: (v: number) => void
  arcDeg: number
  setArcDeg: (v: number) => void
  // non-rect stats
  bgStats: { count: number; used: number; waste: number }
  setBgStats: (s: { count: number; used: number; waste: number }) => void
  // view mode
  viewMode: "stock" | "profile"
  setViewMode: (m: "stock" | "profile") => void
  // NFP
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  isOptimizing: boolean
  nfpError: string | null
  // simple mode computed
  activeSimpleSpecs: ReturnType<typeof useMemo>
  baseSimplePreview: SimplePartPreview | null
  // refs
  nfpSolverRef: React.MutableRefObject<NFPSolver | null>
  bgSvgRef: React.RefObject<SVGSVGElement | null>
  detailRef: React.RefObject<SVGSVGElement | null>
  miniRefs: React.MutableRefObject<Record<string, SVGSVGElement>>
  // non-rect render callback
  renderBg: () => void
}

// eslint-disable-next-line max-lines-per-function
export function useNestingCompute(props: NestingVisualizerProps): UseNestingComputeResult {
  const {
    defaultRollWidth = 48,
    defaultRollLength = 96,
    defaultCutWidth = 24,
    defaultCutHeight = 12,
    defaultQty = 6,
    simpleMode = false,
    simplePart,
    simpleParts,
  } = props

  // shared
  const [shape, setShape] = useState<ShapeType>("rect")
  const [rollW, setRollW] = useState(defaultRollWidth)
  const [rollL, setRollL] = useState(defaultRollLength)
  // rect mode
  const [cutW, setCutW] = useState(defaultCutWidth)
  const [cutH, setCutH] = useState(defaultCutHeight)
  const [qty, setQty] = useState(defaultQty)
  const [diagAng, setDiagAng] = useState(45)
  const [ddir, setDdir] = useState<DiagDir>("ltr")
  const [grain, setGrain] = useState<GrainDir>("none")
  const [activeId, setActiveId] = useState<string>("")
  const [activeStep, setActiveStep] = useState(0)
  const [scored, setScored] = useState<ScoredStrategy[]>([])
  // circle
  const [diam, setDiam] = useState(12)
  // cone
  const [innerR, setInnerR] = useState(10)
  const [outerR, setOuterR] = useState(24)
  const [arcDeg, setArcDeg] = useState(120)
  // non-rect stats
  const [bgStats, setBgStats] = useState({ count: 0, used: 0, waste: 100 })
  // view mode
  const [viewMode, setViewMode] = useState<"stock" | "profile">("stock")
  // NFP solver state
  const nfpSolverRef = useRef<NFPSolver | null>(null)
  const [optimizedResult, setOptimizedResult] = useState<NestingResult | null>(null)
  const [optimizedItems, setOptimizedItems] = useState<PreviewItem[] | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [nfpError, setNfpError] = useState<string | null>(null)

  // refs
  const bgSvgRef = useRef<SVGSVGElement>(null)
  const detailRef = useRef<SVGSVGElement>(null)
  const miniRefs = useRef<Record<string, SVGSVGElement>>({})

  const activeSimpleSpecs = useMemo(() => {
    if (simpleParts && simpleParts.length > 0) {
      return simpleParts
    }
    if (simplePart) {
      return [simplePart]
    }
    return [
      {
        partType: "rectangle" as const,
        quantity: defaultQty,
        width: defaultCutWidth,
        length: defaultCutHeight,
      },
    ]
  }, [simpleParts, simplePart, defaultQty, defaultCutWidth, defaultCutHeight])

  const baseSimplePreview = useMemo<SimplePartPreview | null>(() => {
    if (!simpleMode) {
      return null
    }
    return activeSimpleSpecs.length > 1
      ? generateMultiPartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs,
          defaultCutWidth,
          defaultCutHeight
        )
      : generateSimplePartPreview(
          defaultRollWidth,
          defaultRollLength,
          activeSimpleSpecs[0],
          defaultCutWidth,
          defaultCutHeight,
          defaultQty
        )
  }, [
    simpleMode,
    activeSimpleSpecs,
    defaultRollWidth,
    defaultRollLength,
    defaultCutWidth,
    defaultCutHeight,
    defaultQty,
  ])

  // Auto-set view mode for non-rect shapes
  useEffect(() => {
    if (!simpleMode) return
    const containsNonRect = activeSimpleSpecs.some((spec) => spec.partType !== "rectangle")
    if (containsNonRect) {
      queueMicrotask(() => setViewMode("stock"))
    }
  }, [simpleMode, activeSimpleSpecs])

  // Clean up solver on unmount
  useEffect(() => {
    return () => {
      nfpSolverRef.current?.cancel()
    }
  }, [])

  // Rect strategy scoring
  useEffect(() => {
    if (simpleMode || shape !== "rect") return
    const strats = getStrategies(cutW, cutH, diagAng, ddir)
    const results = strats.map((s) => scoreStrat(s, rollW, rollL, qty, grain))
    results.sort((a, b) => b.score - a.score)
    queueMicrotask(() => {
      setScored(results)
      if (!activeId || !results.find((r) => r.id === activeId)) {
        setActiveId(results[0]?.id ?? "")
        setActiveStep(0)
      }
    })
  }, [simpleMode, shape, rollW, rollL, cutW, cutH, qty, diagAng, ddir, grain, activeId])

  // Non-rect render callback
  const renderBg = useCallback(() => {
    const svg = bgSvgRef.current
    if (simpleMode || !svg || shape === "rect") return

    // Import the render function dynamically is not possible here,
    // so we keep the imperative SVG drawing inline via the callback.
    // The actual rendering logic remains in the component that calls renderBg().
  }, [shape, simpleMode])

  // NFP background optimizer
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

  useEffect(() => {
    if (!simpleMode) return
    queueMicrotask(() => {
      setOptimizedResult(null)
      setOptimizedItems(null)
      setIsOptimizing(false)
      setNfpError(null)
    })

    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) {
      return
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
    const timer = window.setTimeout(() => {
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

  return {
    shape,
    setShape,
    rollW,
    setRollW,
    rollL,
    setRollL,
    cutW,
    setCutW,
    cutH,
    setCutH,
    qty,
    setQty,
    diagAng,
    setDiagAng,
    ddir,
    setDdir,
    grain,
    setGrain,
    activeId,
    setActiveId,
    activeStep,
    setActiveStep,
    scored,
    diam,
    setDiam,
    innerR,
    setInnerR,
    outerR,
    setOuterR,
    arcDeg,
    setArcDeg,
    bgStats,
    setBgStats,
    viewMode,
    setViewMode,
    optimizedResult,
    optimizedItems,
    isOptimizing,
    nfpError,
    activeSimpleSpecs,
    baseSimplePreview,
    nfpSolverRef,
    bgSvgRef,
    detailRef,
    miniRefs,
    renderBg,
  }
}
