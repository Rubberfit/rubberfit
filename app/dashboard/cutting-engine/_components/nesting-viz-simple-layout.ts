// Layout computation for NestingVizSimpleMode
// Extracted to reduce function complexity below ESLint threshold

import type { SimplePartPreview, PreviewItem } from "./nesting-visualizer-types"
import type { NestingResult } from "@/nesting/types"
import { formatInches, getPlacementBounds } from "./nesting-layout-utils"
import {
  computeFabricationScore,
  compareStockLayoutPreviews,
  buildOptimizedStockPreview,
} from "./nesting-preview-builders"

// Aspect ratio above which the sheet rotates 90° on screen so the long
// edge runs along the bottom of the graph card. Purely visual — Rust
// still packs the original orientation; LayoutModel polygons are
// untouched.
const ROTATE_THRESHOLD = 1.5

interface SimpleModeLayoutInput {
  preview: SimplePartPreview
  previewRollW: number
  previewRollL: number
  patternSeed: string
  viewMode: "stock" | "profile"
  optimizedResult: NestingResult | null
  optimizedItems: PreviewItem[] | null
}

export interface SimpleModeLayout {
  displayPreview: SimplePartPreview
  isOptimizedResult: boolean
  fabScore: {
    score: number
    breakdown: {
      wasteScore: number
      reusableScore: number
      seamScore: number
      nestingScore: number
    }
  }
  stockSqFt: number
  usedSqFt: number
  reusableOffcutSqFt: number
  scrapSqFt: number
  reusableOffcutPct: number
  scrapPct: number
  layoutNote: string
  displayItems: PreviewItem[]
  shapeFirstView: boolean
  viewWidth: number
  viewHeight: number
  scale: number
  surfaceX: number
  surfaceY: number
  surfacePxW: number
  surfacePxH: number
  unitOriginX: number
  unitOriginY: number
  canvasUnitsW: number
  canvasUnitsH: number
  /**
   * True when the sheet renders rotated 90° on screen so the long
   * edge runs along the bottom. Always false for shape-first views.
   * Drives the SVG `<g transform>` wrapper in SheetSvg and the label
   * swap in SimpleModeDimensionLabels.
   */
  displayRotated: boolean
  /**
   * Effective rendered surface — equal to `surfaceX/Y/PxW/PxH/scale`
   * when `displayRotated` is false, swapped to landscape dims when
   * true. SheetSvg uses these for the stock background, the
   * clipPath, and the dimension-line endpoints; the parts, offcuts,
   * scrap, and AABB overlays continue to render against the portrait
   * `surfaceX/Y/scale` and are mapped into the landscape rectangle
   * by the rotation transform.
   */
  effSurfaceX: number
  effSurfaceY: number
  effSurfacePxW: number
  effSurfacePxH: number
  effScale: number
  stockPatternId: string
  offcutPatternId: string
  wastePatternId: string
  usablePatternId: string
  markerId: string
  rowLabelY: number
  colLabelX: number
  requestedCutPieceCount: number
  isSplitStockPreview: boolean
  missingCutPieceCount: number
  pieceCountLabel: string
  reusableMetricLabel: string
  scrapMetricLabel: string
  pieceCountValue: string
  previewTitle: string
  localBlankX: number
  localBlankY: number
  localBlankW: number
  localBlankH: number
  showOffcutLabel: boolean
  offcutLabelBands: SimplePartPreview["offcutBands"]
  showCutPlan: boolean
  metricsAreEstimatedFromStock: boolean
  previewRollW: number
  previewRollL: number
  preview: SimplePartPreview
}

// eslint-disable-next-line complexity -- layout computation with many derived values
export function computeSimpleModeLayout(input: SimpleModeLayoutInput): SimpleModeLayout {
  const {
    preview,
    previewRollW,
    previewRollL,
    patternSeed,
    viewMode,
    optimizedResult,
    optimizedItems,
  } = input
  const shapeFirstView = viewMode === "profile"
  const hasOptimizedStockLayout =
    viewMode === "stock" &&
    optimizedResult !== null &&
    optimizedItems !== null &&
    optimizedItems.length > 0
  let displayPreview: SimplePartPreview = preview
  let optimizedStockPreview: SimplePartPreview | null = null
  if (hasOptimizedStockLayout && optimizedResult && optimizedItems) {
    optimizedStockPreview = buildOptimizedStockPreview(
      preview,
      optimizedResult,
      optimizedItems,
      previewRollW,
      previewRollL
    )
    if (compareStockLayoutPreviews(optimizedStockPreview, preview) < 0) {
      displayPreview = optimizedStockPreview
    }
  }
  const isOptimizedResult =
    optimizedStockPreview !== null && displayPreview === optimizedStockPreview
  const fabScore = computeFabricationScore(displayPreview, previewRollW, previewRollL)
  const stockSqFt = (previewRollW * previewRollL) / 144
  const usedSqFt = displayPreview.usedArea / 144
  const reusableOffcutSqFt = displayPreview.reusableArea / 144
  const scrapSqFt = displayPreview.scrapArea / 144
  const reusableOffcutPct = stockSqFt > 0 ? (reusableOffcutSqFt / stockSqFt) * 100 : 0
  const scrapPct = stockSqFt > 0 ? (scrapSqFt / stockSqFt) * 100 : 0
  const layoutNote = isOptimizedResult
    ? `${displayPreview.strategyNote} Optimized placements and metrics are shown in stock layout.`
    : displayPreview.strategyNote
  const displayItems = displayPreview.items
  const previewBounds = getPlacementBounds(displayItems)

  // SVG layout
  const viewWidth = 980
  const viewHeight = 560
  const padLeft = 74
  const padRight = 112
  const padTop = 82
  const padBottom = 80
  const drawWidth = viewWidth - padLeft - padRight
  const drawHeight = viewHeight - padTop - padBottom
  const heroPadX = shapeFirstView ? Math.max(previewBounds.occupiedWidth * 0.12, 1.5) : 0
  const heroPadY = shapeFirstView ? Math.max(previewBounds.occupiedHeight * 0.12, 1.5) : 0
  const canvasUnitsW = shapeFirstView
    ? Math.max(previewBounds.occupiedWidth + heroPadX * 2, 1)
    : previewRollW
  const canvasUnitsH = shapeFirstView
    ? Math.max(previewBounds.occupiedHeight + heroPadY * 2, 1)
    : previewRollL
  const unitOriginX = shapeFirstView ? previewBounds.minX - heroPadX : 0
  const unitOriginY = shapeFirstView ? previewBounds.minY - heroPadY : 0
  const scale = Math.min(drawWidth / canvasUnitsW, drawHeight / canvasUnitsH)
  const surfacePxW = canvasUnitsW * scale
  const surfacePxH = canvasUnitsH * scale
  const surfaceX = padLeft + (drawWidth - surfacePxW) / 2
  const surfaceY = padTop + (drawHeight - surfacePxH) / 2

  // Display rotation: tall portrait sheets render landscape with the
  // long side at the bottom for screen readability. The portrait
  // reference (canvasUnitsW/H, surfaceX/Y, surfacePxW/H, scale) stays
  // untouched — shape renderers continue to compute part positions
  // against it, and the SVG `<g>` wrapper rotates the portrait-coord
  // output into the landscape rectangle. The eff* fields describe
  // the rendered surface; SheetSvg uses them for the stock background
  // + clipPath, and SimpleModeDimensionLabels uses them for line
  // endpoints. When displayRotated is false, eff* === original.
  const displayRotated = !shapeFirstView && previewRollL > previewRollW * ROTATE_THRESHOLD
  const effCanvasUnitsW = displayRotated ? canvasUnitsH : canvasUnitsW
  const effCanvasUnitsH = displayRotated ? canvasUnitsW : canvasUnitsH
  const effScale = displayRotated
    ? Math.min(drawWidth / effCanvasUnitsW, drawHeight / effCanvasUnitsH)
    : scale
  const effSurfacePxW = effCanvasUnitsW * effScale
  const effSurfacePxH = effCanvasUnitsH * effScale
  const effSurfaceX = padLeft + (drawWidth - effSurfacePxW) / 2
  const effSurfaceY = padTop + (drawHeight - effSurfacePxH) / 2

  // Pattern IDs
  const stockPatternId = `stock-${patternSeed}`
  const offcutPatternId = `offcut-${patternSeed}`
  const wastePatternId = `waste-${patternSeed}`
  const usablePatternId = `usable-${patternSeed}`
  const markerId = `arrow-${patternSeed}`

  // Label positions — anchored to the rendered surface so dim arrows
  // sit at the landscape edges when displayRotated.
  const rowLabelY = effSurfaceY + effSurfacePxH + 50
  const colLabelX = effSurfaceX + effSurfacePxW + 50

  // Metrics
  const metricsAreEstimatedFromStock = false
  const requestedCutPieceCount =
    displayPreview.requestedUnits * Math.max(displayPreview.piecesPerUnit, 1)
  const isSplitStockPreview =
    displayPreview.renderShape !== "rect" && displayPreview.piecesPerUnit > 1
  const missingCutPieceCount = Math.max(0, requestedCutPieceCount - displayPreview.piecesShown)
  const pieceCountLabel =
    displayPreview.renderShape === "rect" || displayPreview.piecesPerUnit > 1
      ? isSplitStockPreview
        ? "Cut pieces placed"
        : "Cut pieces"
      : "Profiles placed"
  const reusableMetricLabel = "Reusable offcut"
  const scrapMetricLabel = "Waste"
  const pieceCountValue = isSplitStockPreview
    ? `${displayPreview.piecesShown}/${requestedCutPieceCount}`
    : `${displayPreview.piecesShown}`
  const previewTitle = isSplitStockPreview
    ? `${displayPreview.strategyName} - ${displayPreview.requestedUnits} finished profile${displayPreview.requestedUnits === 1 ? "" : "s"} / ${requestedCutPieceCount} cut section${requestedCutPieceCount === 1 ? "" : "s"}`
    : `${displayPreview.strategyName} - ${displayPreview.requestedUnits} part${displayPreview.requestedUnits === 1 ? "" : "s"} requested`

  // Blank and offcut labels
  const localBlankX = surfaceX + (previewBounds.minX - unitOriginX) * scale
  const localBlankY = surfaceY + (previewBounds.minY - unitOriginY) * scale
  const localBlankW = previewBounds.occupiedWidth * scale
  const localBlankH = previewBounds.occupiedHeight * scale
  const showOffcutLabel =
    !shapeFirstView && displayPreview.wasteMode === "bands" && displayPreview.offcutBands.length > 0
  const offcutLabelBands = showOffcutLabel
    ? [...displayPreview.offcutBands]
        .sort((a, b) => b.width * b.height - a.width * a.height)
        .filter((band) => band.width * scale > 42 && band.height * scale > 14)
    : []
  const showCutPlan = displayPreview.renderShape !== "rect"

  return {
    displayPreview,
    isOptimizedResult,
    fabScore,
    stockSqFt,
    usedSqFt,
    reusableOffcutSqFt,
    scrapSqFt,
    reusableOffcutPct,
    scrapPct,
    layoutNote,
    displayItems,
    shapeFirstView,
    viewWidth,
    viewHeight,
    scale,
    surfaceX,
    surfaceY,
    surfacePxW,
    surfacePxH,
    unitOriginX,
    unitOriginY,
    canvasUnitsW,
    canvasUnitsH,
    displayRotated,
    effSurfaceX,
    effSurfaceY,
    effSurfacePxW,
    effSurfacePxH,
    effScale,
    stockPatternId,
    offcutPatternId,
    wastePatternId,
    usablePatternId,
    markerId,
    rowLabelY,
    colLabelX,
    requestedCutPieceCount,
    isSplitStockPreview,
    missingCutPieceCount,
    pieceCountLabel,
    reusableMetricLabel,
    scrapMetricLabel,
    pieceCountValue,
    previewTitle,
    localBlankX,
    localBlankY,
    localBlankW,
    localBlankH,
    showOffcutLabel,
    offcutLabelBands,
    showCutPlan,
    metricsAreEstimatedFromStock,
    previewRollW,
    previewRollL,
    preview,
  }
}

export { formatInches }
