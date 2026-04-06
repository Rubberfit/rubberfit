// Preview builder functions for NestingVisualizer

import type {
  OffcutBand,
  PreviewItem,
  RectLikePreview,
  SimplePartPreview,
  SimplePreviewBase,
  SimplePartSpec,
  SimpleCutDirection,
  PackedShapeLayout,
} from "./nesting-visualizer-types"
import {
  formatInches,
  buildRectPlacements,
  buildOriginRectOffcutBands,
  buildOffcutBands,
  isReusableOffcutBand,
  computeIntraBlankWaste,
  getPlacementBounds,
  centerPlacements,
  buildRectangleSteps,
} from "./nesting-layout-utils"

export function buildRectPreview(
  layout: {
    pieceW: number
    pieceH: number
    rowCounts: number[]
    placed: number
    orientation: "default" | "rotated"
    reusableArea: number
    scrapArea: number
  },
  strategyName: string,
  strategyNote: string,
  requestedUnits: number,
  piecesPerUnit: number,
  pieceArea: number,
  label: string
): RectLikePreview {
  const cutPlan = buildRectangleSteps(layout as Parameters<typeof buildRectangleSteps>[0])
  const placements = buildRectPlacements(layout.pieceW, layout.pieceH, layout.rowCounts)
  const items: PreviewItem[] = placements.map((placement) => ({
    ...placement,
    renderShape: "rect",
    label,
  }))

  const { occupiedWidth, occupiedHeight } = getPlacementBounds(placements)
  const unitsCompleted = Math.floor(layout.placed / piecesPerUnit)
  const usedArea = layout.placed * pieceArea
  return {
    renderShape: "rect",
    strategyName,
    strategyNote,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
    requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, requestedUnits - unitsCompleted),
    piecesShown: layout.placed,
    piecesPerUnit,
    usedArea,
    wasteArea: 0,
    wastePct: 0,
    reusableArea: layout.reusableArea,
    scrapArea: layout.scrapArea,
    items,
    placements,
    occupiedWidth,
    occupiedHeight,
    offcutBands: [],
    scrapBands: [],
    label,
  }
}

export function withWaste(preview: RectLikePreview, rollW: number, rollL: number): RectLikePreview {
  const rollArea = rollW * rollL
  const positioned =
    preview.placementMode === "center"
      ? centerPlacements(preview.placements, rollW, rollL)
      : {
          positions: preview.placements,
          occupiedWidth: preview.occupiedWidth,
          occupiedHeight: preview.occupiedHeight,
        }
  const bounds = getPlacementBounds(positioned.positions)
  const pieceW = positioned.positions[0]?.width ?? 0
  const pieceH = positioned.positions[0]?.height ?? 0

  if (preview.wasteMode === "bands" && preview.placementMode === "origin") {
    if (preview.renderShape === "rect") {
      const allBands = buildOriginRectOffcutBands(positioned.positions, rollW, rollL)
      const reusableBands: OffcutBand[] = []
      const scrapBands: OffcutBand[] = []
      let reusableArea = 0
      let scrapArea = 0

      allBands.forEach((band) => {
        const area = band.width * band.height
        if (isReusableOffcutBand(band, pieceW, pieceH)) {
          reusableBands.push(band)
          reusableArea += area
        } else {
          scrapBands.push(band)
          scrapArea += area
        }
      })

      const totalWasteArea = reusableArea + scrapArea
      return {
        ...preview,
        placements: positioned.positions,
        occupiedWidth: positioned.occupiedWidth,
        occupiedHeight: positioned.occupiedHeight,
        wasteArea: totalWasteArea,
        wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
        reusableArea,
        scrapArea,
        offcutBands: reusableBands,
        scrapBands,
      }
    }

    const allBands = buildOffcutBands(bounds, rollW, rollL, "origin")
    const reusableBands: OffcutBand[] = []
    const scrapBands: OffcutBand[] = []
    let reusableArea = 0
    let bandScrapArea = 0

    allBands.forEach((band) => {
      const area = band.width * band.height
      if (isReusableOffcutBand(band, pieceW, pieceH)) {
        reusableBands.push(band)
        reusableArea += area
      } else {
        scrapBands.push(band)
        bandScrapArea += area
      }
    })

    const intraBlankWaste = preview.items.reduce(
      (sum, item) => sum + computeIntraBlankWaste(item),
      0
    )
    const scrapArea = bandScrapArea + intraBlankWaste
    const totalWasteArea = reusableArea + scrapArea

    return {
      ...preview,
      placements: positioned.positions,
      occupiedWidth: positioned.occupiedWidth,
      occupiedHeight: positioned.occupiedHeight,
      wasteArea: totalWasteArea,
      wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
      reusableArea,
      scrapArea,
      offcutBands: reusableBands,
      scrapBands,
    }
  }

  const totalWasteArea = Math.max(0, rollArea - preview.usedArea)
  return {
    ...preview,
    placements: positioned.positions,
    occupiedWidth: positioned.occupiedWidth,
    occupiedHeight: positioned.occupiedHeight,
    wasteArea: totalWasteArea,
    wastePct: rollArea > 0 ? (totalWasteArea / rollArea) * 100 : 100,
    reusableArea: 0,
    scrapArea: totalWasteArea,
    offcutBands:
      preview.wasteMode === "bands"
        ? buildOffcutBands(bounds, rollW, rollL, preview.placementMode)
        : [],
    scrapBands: [],
  }
}

export function chooseBestPreview<T extends SimplePreviewBase & { adjustedWaste: number }>(
  candidates: T[]
): T {
  if (candidates.length === 0) {
    throw new Error("chooseBestPreview requires at least one candidate")
  }

  return [...candidates].sort((a, b) => {
    if (a.unitsCompleted !== b.unitsCompleted) return b.unitsCompleted - a.unitsCompleted
    if (a.overflowUnits !== b.overflowUnits) return a.overflowUnits - b.overflowUnits
    if (a.adjustedWaste !== b.adjustedWaste) return a.adjustedWaste - b.adjustedWaste
    return a.piecesPerUnit - b.piecesPerUnit
  })[0]
}

export function computeFabricationScore(preview: SimplePreviewBase, rollW: number, rollL: number) {
  const rollArea = rollW * rollL
  const wastePct = rollArea > 0 ? (preview.wasteArea / rollArea) * 100 : 100
  const wasteScore = Math.max(0, 100 - wastePct * 2)

  const reusablePct = preview.wasteArea > 0 ? (preview.reusableArea / preview.wasteArea) * 100 : 0
  const reusableScore = Math.min(100, reusablePct)

  const seams = preview.piecesPerUnit
  const seamScore =
    seams <= 1 ? 100 : seams <= 2 ? 85 : seams <= 4 ? 60 : Math.max(0, 100 - seams * 8)

  const occupied = preview.occupiedWidth * preview.occupiedHeight
  const nestingEff = occupied > 0 ? (preview.usedArea / occupied) * 100 : 0
  const nestingScore = Math.min(100, nestingEff)

  const score = Math.round(
    wasteScore * 0.4 + reusableScore * 0.2 + seamScore * 0.2 + nestingScore * 0.2
  )
  return {
    score,
    breakdown: {
      wasteScore: Math.round(wasteScore),
      reusableScore: Math.round(reusableScore),
      seamScore: Math.round(seamScore),
      nestingScore: Math.round(nestingScore),
    },
  }
}

export function compareStockLayoutPreviews(a: SimplePartPreview, b: SimplePartPreview) {
  if (a.unitsCompleted !== b.unitsCompleted) return b.unitsCompleted - a.unitsCompleted
  if (a.overflowUnits !== b.overflowUnits) return a.overflowUnits - b.overflowUnits
  if (Math.abs(a.scrapArea - b.scrapArea) > 0.001) return a.scrapArea - b.scrapArea
  if (Math.abs(a.occupiedHeight - b.occupiedHeight) > 0.001)
    return a.occupiedHeight - b.occupiedHeight
  const aFootprint = a.occupiedWidth * a.occupiedHeight
  const bFootprint = b.occupiedWidth * b.occupiedHeight
  if (Math.abs(aFootprint - bFootprint) > 0.001) return aFootprint - bFootprint
  if (Math.abs(a.reusableArea - b.reusableArea) > 0.001) return b.reusableArea - a.reusableArea
  if (Math.abs(a.occupiedWidth - b.occupiedWidth) > 0.001) return a.occupiedWidth - b.occupiedWidth
  return 0
}

export function shouldAutoOptimizeInteractiveLayout(specs: SimplePartSpec[]) {
  if (specs.length !== 1) {
    return false
  }

  const [spec] = specs
  if (!spec) {
    return false
  }

  // Interactive stock view needs to stay deterministic and responsive.
  // Cone/cylinder/trapezoid splits already generate valid cut pieces locally,
  // and background NFP solving has been the main source of UI jank.
  if (spec.partType === "cone" || spec.partType === "cylinder" || spec.partType === "trapezoid") {
    return false
  }

  return false
}

// Re-export stock preview builders from their new module
export {
  buildOptimizedStockPreview,
  buildCustomPackedPreview,
  buildCustomPackedPreviewFromPackedResult,
} from "./nesting-stock-preview"

export function buildPackedPreview(
  layout: PackedShapeLayout,
  config: {
    renderShape: "trapezoid" | "sector"
    strategyName: string
    strategyNote: string
    cutDirection?: SimpleCutDirection
    requestedUnits: number
    piecesPerUnit: number
    pieceArea: number
    label: string
    topWidth?: number
    bottomWidth?: number
    height?: number
    innerRadius?: number
    outerRadius?: number
    arcDegrees?: number
  }
): RectLikePreview {
  const unitsCompleted = Math.floor(layout.placed / config.piecesPerUnit)
  const usedArea = layout.placed * config.pieceArea

  return {
    renderShape: config.renderShape,
    strategyName: config.strategyName,
    strategyNote: config.strategyNote,
    cutDirection: config.cutDirection,
    placementMode: "origin",
    wasteMode: "bands",
    cutPlanTitle: "Cut sequence",
    cutSteps: [],
    requestedUnits: config.requestedUnits,
    unitsCompleted,
    overflowUnits: Math.max(0, config.requestedUnits - unitsCompleted),
    piecesShown: layout.placed,
    piecesPerUnit: config.piecesPerUnit,
    usedArea,
    wasteArea: 0,
    wastePct: 0,
    reusableArea: 0,
    scrapArea: 0,
    items: layout.positions.map((placement) => ({
      ...placement,
      renderShape: config.renderShape,
      label: config.label,
      cutDirection: config.cutDirection,
      topWidth: config.topWidth,
      bottomWidth: config.bottomWidth,
      innerRadius: config.innerRadius,
      outerRadius: config.outerRadius,
      arcDegrees: config.arcDegrees,
    })),
    placements: layout.positions,
    occupiedWidth: layout.occupiedWidth,
    occupiedHeight: layout.occupiedHeight,
    offcutBands: [],
    scrapBands: [],
    label: config.label,
    topWidth: config.topWidth,
    bottomWidth: config.bottomWidth,
    height: config.height,
    innerRadius: config.innerRadius,
    outerRadius: config.outerRadius,
    arcDegrees: config.arcDegrees,
  }
}

// Re-export split section builders from their new module
export { buildConeSplitSections, buildTrapezoidSplitSections } from "./nesting-split-sections"

export function getPartTypeLabel(partType: string) {
  switch (partType) {
    case "circle":
      return "Circle"
    case "cylinder":
      return "Cylinder Wrap"
    case "cone":
      return "Cone Spread"
    case "trapezoid":
      return "Trapezoid"
    case "rectangle":
    default:
      return "Rectangle"
  }
}

export function buildPartPreviewItem(
  spec: SimplePartSpec,
  fallbackWidth: number,
  fallbackHeight: number
): PreviewItem & { usedArea: number } {
  switch (spec.partType) {
    case "circle": {
      const diameter = spec.diameter ?? fallbackWidth
      const radius = diameter / 2
      return {
        x: 0,
        y: 0,
        width: diameter,
        height: diameter,
        renderShape: "circle",
        label: `Ø${formatInches(diameter)}"`,
        diameter,
        usedArea: Math.PI * radius * radius,
      }
    }
    case "cylinder": {
      const diameter = spec.diameter ?? fallbackWidth
      const height = spec.height ?? fallbackHeight
      const circumference = Math.PI * diameter
      return {
        x: 0,
        y: 0,
        width: circumference,
        height,
        renderShape: "rect",
        label: `${formatInches(circumference)}" × ${formatInches(height)}"`,
        cutDirection: spec.cutDirection,
        usedArea: circumference * height,
      }
    }
    case "cone": {
      const innerRadius = spec.innerRadius ?? Math.max(1, fallbackWidth / 2)
      const outerRadius = spec.outerRadius ?? Math.max(innerRadius + 1, fallbackHeight)
      const arcDegrees = spec.arcDegrees ?? 120
      const halfArcRad = (arcDegrees * Math.PI) / 360
      const width = Math.max(2, 2 * outerRadius * Math.sin(halfArcRad))
      const height = Math.max(2, outerRadius - innerRadius * Math.cos(halfArcRad))
      return {
        x: 0,
        y: 0,
        width,
        height,
        renderShape: "sector",
        label: `${Math.round(arcDegrees)}° sector`,
        cutDirection: spec.cutDirection,
        innerRadius,
        outerRadius,
        arcDegrees,
        usedArea: (arcDegrees / 360) * Math.PI * (outerRadius ** 2 - innerRadius ** 2),
      }
    }
    case "trapezoid": {
      const topWidth = spec.topWidth ?? fallbackWidth
      const bottomWidth = spec.bottomWidth ?? fallbackWidth
      const height = spec.height ?? fallbackHeight
      return {
        x: 0,
        y: 0,
        width: Math.max(topWidth, bottomWidth),
        height,
        renderShape: "trapezoid",
        label: `${formatInches(topWidth)}" / ${formatInches(bottomWidth)}" × ${formatInches(height)}"`,
        cutDirection: spec.cutDirection,
        topWidth,
        bottomWidth,
        usedArea: ((topWidth + bottomWidth) / 2) * height,
      }
    }
    case "rectangle":
    default: {
      const width = spec.width ?? fallbackWidth
      const height = spec.length ?? fallbackHeight
      return {
        x: 0,
        y: 0,
        width,
        height,
        renderShape: "rect",
        label: `${formatInches(width)}" × ${formatInches(height)}"`,
        usedArea: width * height,
      }
    }
  }
}

// Re-export generate* functions from their new module
export {
  generateRectanglePreview,
  generateCirclePreview,
  generateCylinderPreview,
  generateConePreview,
  generateTrapezoidPreview,
  generateMultiPartPreview,
  generateSimplePartPreview,
} from "./nesting-shape-previews"
