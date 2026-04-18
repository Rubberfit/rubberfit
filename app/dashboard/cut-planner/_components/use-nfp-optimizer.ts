// NFP background optimizer hook for NestingVisualizer
// Extracted from NestingVisualizer.tsx
//
// S1 canonical pipeline: resolves IPackingService via TSyringe DI (see di/resolve)
// instead of constructing NFPSolver directly. The hook still exposes the legacy
// optimizedResult (NestingResult) + optimizedItems (PreviewItem[]) shapes so
// downstream render helpers (buildOptimizedStockPreview, nesting-shape-renderer,
// etc.) keep working. A canonical PlacementView is also exposed for callers
// that migrate off the legacy shapes.

import { useState, useEffect, useMemo } from "react"
import "reflect-metadata"
import "@/di/resolve"
import { container } from "tsyringe"
import {
  PACKING_TOKENS,
  type IPackingService,
} from "@/src/application/services/packing.service.interface"
import type {
  PackRequest,
  PackResult,
  Part,
} from "@/src/application/packing/types"
import { buildPart } from "@/src/application/packing/buildPart"
import { buildPackRequest } from "@/src/application/packing/buildPackRequest"
import { buildPlacementView } from "@/src/application/packing/buildPlacementView"
import type { PlacementView } from "@/src/application/packing/placementView"
import type { NestingPart, NestingResult, Placement2D } from "@/nesting/types"
import type { SimplePartSpec, PreviewItem } from "./nesting-visualizer-types"
import { shouldAutoOptimizeInteractiveLayout } from "./nesting-preview-builders"
import { simplePartToNestingParts, nestingResultToPreviewItems } from "./nesting-nfp-helpers"

interface NFPOptimizerResult {
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
  placementView: PlacementView | null
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
  const [optimizedResult, setOptimizedResult] = useState<NestingResult | null>(null)
  const [optimizedItems, setOptimizedItems] = useState<PreviewItem[] | null>(null)
  const [placementView, setPlacementView] = useState<PlacementView | null>(null)
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

  useEffect(() => {
    if (!simpleMode) return
    queueMicrotask(() => {
      setOptimizedResult(null)
      setOptimizedItems(null)
      setPlacementView(null)
      setIsOptimizing(false)
      setNfpError(null)
    })

    /*
      If the passed partType is a cone, cylinder or trapezoid, then the NFP solver does not
      does not run to reduce UI lag.
      Nesting will be done on the bounding boxes instead.
    */
    if (!shouldAutoOptimizeInteractiveLayout(activeSimpleSpecs)) {
      return
    }

    const nestingParts: NestingPart[] = activeSimpleSpecs.flatMap((spec, i) =>
      simplePartToNestingParts(spec, defaultCutWidth, defaultCutHeight, i)
    )

    // Build canonical Parts from the legacy NestingPart polygons. We reuse the
    // already-constructed polygon points so rotation/winding behaviour matches
    // the legacy pipeline exactly (no shape-spec re-derivation).
    const canonicalParts: Part[] = nestingParts.map((np) =>
      buildPart({
        shapeId: np.id,
        quantity: np.quantity,
        polygon: np.polygon.points,
        allowRotation: true,
      })
    )

    let request: PackRequest
    try {
      request = buildPackRequest({
        bins: [
          {
            binId: "preview-bin",
            width: defaultRollWidth,
            height: defaultRollLength,
            kind: "fresh",
          },
        ],
        items: canonicalParts,
        clearance: 0.125,
        mode: "fast",
      })
    } catch (err) {
      setNfpError((err as Error).message)
      return
    }

    const svc = container.resolve<IPackingService>(PACKING_TOKENS.IPackingService)

    let mounted = true
    // Keep the 220ms debounce to avoid thrashing the solver on fast input changes.
    const timer = window.setTimeout(() => {
      if (!mounted) return
      setIsOptimizing(true)
      svc
        .pack(request)
        .then((result) => {
          if (!mounted) return
          const legacyResult = packResultToNestingResult(
            result,
            request,
            defaultRollWidth,
            defaultRollLength,
            nestingParts
          )
          const items = nestingResultToPreviewItems(
            legacyResult,
            nestingParts,
            activeSimpleSpecs,
            defaultCutWidth,
            defaultCutHeight
          )
          setOptimizedResult(legacyResult)
          setOptimizedItems(items.length > 0 ? items : null)
          setPlacementView(buildPlacementView(result, request))
          setIsOptimizing(false)
        })
        .catch((err: unknown) => {
          if (!mounted) return
          console.error("[NFP] Packing service error:", err)
          setNfpError((err as Error).message)
          setOptimizedResult(null)
          setOptimizedItems(null)
          setPlacementView(null)
          setIsOptimizing(false)
        })
    }, 220)

    return () => {
      mounted = false
      window.clearTimeout(timer)
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

  return { optimizedResult, optimizedItems, placementView, isOptimizing, nfpError }
}

// Adapter: map canonical PackResult back to the legacy NestingResult shape the
// downstream preview/renderer code still expects (buildOptimizedStockPreview,
// nestingResultToPreviewItems, etc.). Per-placement polygonArea/boundingBoxArea
// are left at 0 — no consumer reads them today; aggregate usedArea comes from
// result.totalUsedArea.
function packResultToNestingResult(
  result: PackResult,
  request: PackRequest,
  rollWidth: number,
  rollLength: number,
  nestingParts: NestingPart[]
): NestingResult {
  const partById = new Map(nestingParts.map((np) => [np.id, np]))
  const firstBin = result.perBin[0]
  const stockArea = rollWidth * rollLength

  const placements: Placement2D[] = result.placements.map((p) => {
    const src = partById.get(p.shapeId)
    // Legacy partId format expected by nestingResultToPreviewItems is the
    // original NestingPart.id (which equals the canonical shapeId). Keep it
    // identical so the partsById lookup in that helper still resolves.
    return {
      partId: src ? src.id : p.shapeId,
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      polygonArea: 0,
      boundingBoxArea: 0,
      rotation: p.rotationRad,
      placedPolygon: p.polygon,
      flipped: false,
    }
  })

  const occupiedWidth = firstBin?.occupiedWidth ?? 0
  const occupiedHeight = firstBin?.occupiedHeight ?? 0
  const occupiedArea = occupiedWidth * occupiedHeight
  const efficiency = firstBin?.efficiency ?? 0
  // Align with legacy efficiency scale (0-100) used downstream.
  const efficiencyPct = efficiency <= 1 ? efficiency * 100 : efficiency

  return {
    placements,
    placed: result.placedCount,
    overflow: result.overflowCount,
    usedArea: result.totalUsedArea,
    occupiedArea,
    occupiedWidth,
    occupiedHeight,
    stockArea,
    wasteArea: result.totalWasteArea,
    efficiency: efficiencyPct,
    source: "optimized",
  }
}

