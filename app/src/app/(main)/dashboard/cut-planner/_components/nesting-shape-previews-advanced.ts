// Shape-specific preview generators — advanced shapes (cylinder, cone, trapezoid)
// and multi-part / dispatch functions
// Split from nesting-shape-previews.ts

import type { SimplePartPreview, SimpleCutDirection } from "./nesting-visualizer-types"
import {
  formatInches,
  normalizeCutRatios,
  buildCutBreakpoints,
  isConeRadialSplit,
  isCylinderPanelSplit,
  isTrapezoidVerticalSplit,
  calculateSimpleRectLayout,
  buildCylinderSteps,
  buildConeSteps,
  buildTrapezoidSteps,
} from "./nesting-layout-utils"
import {
  calculatePackedShapeLayout,
  packPreviewItemsInCenteredColumn,
} from "./nesting-packing-utils"
import {
  buildRectPreview,
  withWaste,
  chooseBestPreview,
  buildPackedPreview,
  buildCustomPackedPreview,
  buildCustomPackedPreviewFromPackedResult,
  buildConeSplitSections,
  buildTrapezoidSplitSections,
} from "./nesting-preview-builders"

export function generateCylinderPreview(
  rollW: number,
  rollL: number,
  diameter: number,
  height: number,
  qty: number,
  cutDirection: SimpleCutDirection = "wrap_panels",
  cutRatios?: number[]
): SimplePartPreview {
  const circumference = Math.PI * diameter
  if (qty > 1) {
    const ratios = normalizeCutRatios(cutRatios, qty)
    const pieces = ratios.map((ratio, _index) => {
      const panelWidth = isCylinderPanelSplit(cutDirection) ? circumference * ratio : circumference
      const panelHeight = isCylinderPanelSplit(cutDirection) ? height : height * ratio
      return {
        x: 0,
        y: 0,
        width: panelWidth,
        height: panelHeight,
        renderShape: "rect" as const,
        label: `${formatInches(panelWidth)}" \u00D7 ${formatInches(panelHeight)}"`,
        usedArea: panelWidth * panelHeight,
      }
    })
    const panelLayout = buildCustomPackedPreview(rollW, rollL, pieces, {
      renderShape: "rect",
      strategyName: isCylinderPanelSplit(cutDirection)
        ? `${qty}-panel cylinder wrap`
        : `${qty}-band cylinder wrap`,
      strategyNote: isCylinderPanelSplit(cutDirection)
        ? `The cylinder wrap is split into ${qty} vertical panels around the circumference.`
        : `The cylinder wrap is split into ${qty} horizontal bands through the height.`,
      cutDirection,
      requestedUnits: 1,
      piecesPerUnit: qty,
      label: pieces[0]?.label ?? "",
      cutRatios: ratios,
      cutBreakpoints: buildCutBreakpoints(ratios),
      cutLabels: pieces.map((piece) => piece.label),
    })
    const cutPlan = buildCylinderSteps(
      isCylinderPanelSplit(cutDirection) ? circumference * ratios[0] : circumference,
      isCylinderPanelSplit(cutDirection) ? height : height * ratios[0],
      qty
    )
    return {
      ...panelLayout,
      cutDirection,
      cutRatios: ratios,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
    }
  }

  const fullWrap = withWaste(
    buildRectPreview(
      calculateSimpleRectLayout(rollW, rollL, circumference, height, qty),
      "Single flat cylinder wrap",
      "The cylinder body is flattened into one rectangular wrap per finished part.",
      qty,
      1,
      circumference * height,
      `${formatInches(circumference)}" \u00D7 ${formatInches(height)}"`
    ),
    rollW,
    rollL
  )
  const splitWrap = withWaste(
    buildRectPreview(
      calculateSimpleRectLayout(rollW, rollL, circumference / 2, height, qty * 2),
      "Two-panel cylinder wrap",
      "The full wrap is split into two rectangular panels to fit the stock when a single wrap wastes too much or does not fit cleanly.",
      qty,
      2,
      (circumference / 2) * height,
      `${formatInches(circumference / 2)}" \u00D7 ${formatInches(height)}"`
    ),
    rollW,
    rollL
  )

  const best = chooseBestPreview([
    {
      ...fullWrap,
      adjustedWaste: rollW * rollL > 0 ? (fullWrap.scrapArea / (rollW * rollL)) * 100 : 100,
    },
    {
      ...splitWrap,
      adjustedWaste: (rollW * rollL > 0 ? (splitWrap.scrapArea / (rollW * rollL)) * 100 : 100) + 6,
    },
  ])

  const cutPlan = buildCylinderSteps(circumference / best.piecesPerUnit, height, best.piecesPerUnit)

  return {
    ...best,
    cutDirection,
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
  }
}

export function generateConePreview(
  rollW: number,
  rollL: number,
  innerRadius: number,
  outerRadius: number,
  arcDegrees: number,
  qty: number,
  cutDirection: SimpleCutDirection = "radial_split",
  cutRatios?: number[]
): SimplePartPreview {
  const safeInnerRadius = Math.max(0, innerRadius)
  const safeOuterRadius = Math.max(safeInnerRadius, outerRadius)
  const safeArcDegrees = Math.min(320, Math.max(20, arcDegrees))
  const arcArea = (safeArcDegrees / 360) * Math.PI * (safeOuterRadius ** 2 - safeInnerRadius ** 2)
  const requestedCutSections = Math.max(1, qty)
  const halfArcRad = (safeArcDegrees * Math.PI) / 360
  const sectorWidth = Math.max(
    2,
    halfArcRad <= Math.PI / 2 ? 2 * safeOuterRadius * Math.sin(halfArcRad) : 2 * safeOuterRadius
  )
  const sectorHeight = Math.max(
    2,
    Math.max(
      safeOuterRadius * (1 - Math.cos(halfArcRad)),
      safeOuterRadius - safeInnerRadius * Math.cos(halfArcRad)
    )
  )

  if (requestedCutSections > 1) {
    const split = buildConeSplitSections(
      safeInnerRadius,
      safeOuterRadius,
      safeArcDegrees,
      cutDirection,
      cutRatios,
      requestedCutSections
    )

    const sectionItems = split.sections.map((section) => section.item)
    const previewConfig = {
      renderShape: "sector" as const,
      strategyName: isConeRadialSplit(cutDirection)
        ? `${requestedCutSections}-panel radial cone spread`
        : `${requestedCutSections}-band concentric cone spread`,
      strategyNote: isConeRadialSplit(cutDirection)
        ? `The cone spread is split into ${requestedCutSections} radial panels and packed from those actual cut pieces.`
        : `The cone spread is split into ${requestedCutSections} concentric bands and stacked by band size on stock from those actual cut pieces.`,
      cutDirection,
      requestedUnits: 1,
      piecesPerUnit: requestedCutSections,
      label: split.profileItem.label,
      innerRadius: safeInnerRadius,
      outerRadius: safeOuterRadius,
      arcDegrees: safeArcDegrees,
      cutRatios,
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      flipPattern: isConeRadialSplit(cutDirection) ? ("checker" as const) : ("none" as const),
    }

    const preview = isConeRadialSplit(cutDirection)
      ? buildCustomPackedPreview(rollW, rollL, sectionItems, previewConfig)
      : buildCustomPackedPreviewFromPackedResult(
          rollW,
          rollL,
          packPreviewItemsInCenteredColumn(sectionItems, rollW, rollL),
          previewConfig
        )

    const cutPlan = buildConeSteps(
      safeInnerRadius,
      safeOuterRadius,
      safeArcDegrees,
      requestedCutSections
    )

    return {
      ...preview,
      cutDirection,
      cutRatios: normalizeCutRatios(cutRatios, requestedCutSections),
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      profileItem: split.profileItem,
      sections: split.sections,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
      arcDegrees: safeArcDegrees,
    }
  }

  const rollArea = rollW * rollL

  // Determine whether rotating the sector 90° fits more pieces on the stock
  const uprightCapacity =
    Math.floor(rollW / sectorWidth + 0.001) * Math.floor(rollL / sectorHeight + 0.001)
  const rotatedCapacity =
    Math.floor(rollW / sectorHeight + 0.001) * Math.floor(rollL / sectorWidth + 0.001)
  const useSectorRotated =
    rotatedCapacity > uprightCapacity && Math.abs(sectorWidth - sectorHeight) > 0.001
  const placedW = useSectorRotated ? sectorHeight : sectorWidth
  const placedH = useSectorRotated ? sectorWidth : sectorHeight

  const sectorConfig = {
    renderShape: "sector" as const,
    requestedUnits: qty,
    piecesPerUnit: 1,
    pieceArea: arcArea,
    label: `${Math.round(safeArcDegrees)}\u00B0 sector`,
    innerRadius: safeInnerRadius,
    outerRadius: safeOuterRadius,
    arcDegrees: safeArcDegrees,
  }

  const directGrid = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, placedW, placedH, qty, {
        rotated90: useSectorRotated,
      }),
      {
        ...sectorConfig,
        strategyName: "Single cone spread",
        strategyNote:
          "The cone/frustum liner is flattened into one full annular-sector spread per finished part.",
      }
    ),
    rollW,
    rollL
  )

  const checkerGrid = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, placedW, placedH, qty, {
        stepX: Math.max(placedW * 0.7, 2),
        stepY: Math.max(placedH * 0.88, 2),
        rowOffset: placedW * 0.38,
        alternateOffset: true,
        flipPattern: "checker",
        rotated90: useSectorRotated,
      }),
      {
        ...sectorConfig,
        strategyName: "Alternating cone spreads",
        strategyNote:
          "Full cone spreads alternate up/down to interlock arcs and reduce corner waste between pieces.",
      }
    ),
    rollW,
    rollL
  )

  const bestSector = chooseBestPreview([
    { ...directGrid, adjustedWaste: rollArea > 0 ? (directGrid.scrapArea / rollArea) * 100 : 100 },
    {
      ...checkerGrid,
      adjustedWaste: rollArea > 0 ? (checkerGrid.scrapArea / rollArea) * 100 : 100,
    },
  ])

  const singleCutPlan = buildConeSteps(safeInnerRadius, safeOuterRadius, safeArcDegrees, 1)

  return {
    ...bestSector,
    cutDirection,
    profileItem: {
      x: 0,
      y: 0,
      width: sectorWidth,
      height: sectorHeight,
      renderShape: "sector",
      label: `${Math.round(safeArcDegrees)}\u00B0 sector`,
      cutDirection,
      innerRadius: safeInnerRadius,
      outerRadius: safeOuterRadius,
      arcDegrees: safeArcDegrees,
    },
    cutPlanTitle: singleCutPlan.title,
    cutSteps: singleCutPlan.steps,
    arcDegrees: safeArcDegrees,
  }
}

export function generateTrapezoidPreview(
  rollW: number,
  rollL: number,
  topWidth: number,
  bottomWidth: number,
  height: number,
  qty: number,
  cutDirection: SimpleCutDirection = "vertical_split",
  cutRatios?: number[]
): SimplePartPreview {
  const boxWidth = Math.max(topWidth, bottomWidth)
  const pieceArea = ((topWidth + bottomWidth) / 2) * height
  const requestedCutSections = Math.max(1, qty)

  if (requestedCutSections > 1) {
    const split = buildTrapezoidSplitSections(
      topWidth,
      bottomWidth,
      height,
      cutDirection,
      cutRatios,
      requestedCutSections
    )

    const preview = buildCustomPackedPreview(
      rollW,
      rollL,
      split.sections.map((section) => section.item),
      {
        renderShape: "trapezoid",
        strategyName: isTrapezoidVerticalSplit(cutDirection)
          ? `${requestedCutSections}-panel tapered split`
          : `${requestedCutSections}-band tapered split`,
        strategyNote: isTrapezoidVerticalSplit(cutDirection)
          ? `The tapered panel is split into ${requestedCutSections} tapered sections and packed from those actual cut pieces.`
          : `The tapered panel is split into ${requestedCutSections} horizontal bands and packed from those actual cut pieces.`,
        cutDirection,
        requestedUnits: 1,
        piecesPerUnit: requestedCutSections,
        label: split.profileItem.label,
        topWidth,
        bottomWidth,
        height,
        cutRatios,
        cutBreakpoints: split.cutBreakpoints,
        cutLabels: split.cutLabels,
        flipPattern: isTrapezoidVerticalSplit(cutDirection) ? "checker" : "none",
      }
    )

    const cutPlan = buildTrapezoidSteps(topWidth, bottomWidth, height, requestedCutSections)

    return {
      ...preview,
      cutDirection,
      cutRatios: normalizeCutRatios(cutRatios, requestedCutSections),
      cutBreakpoints: split.cutBreakpoints,
      cutLabels: split.cutLabels,
      profileItem: split.profileItem,
      sections: split.sections,
      cutPlanTitle: cutPlan.title,
      cutSteps: cutPlan.steps,
      topWidth,
      bottomWidth,
      height,
    }
  }

  const rollArea = rollW * rollL
  const trapLabel = `${formatInches(topWidth)}" / ${formatInches(bottomWidth)}" \u00D7 ${formatInches(height)}"`
  const trapConfig = {
    renderShape: "trapezoid" as const,
    requestedUnits: qty,
    piecesPerUnit: 1,
    pieceArea,
    label: trapLabel,
    topWidth,
    bottomWidth,
    height,
  }

  const direct = withWaste(
    buildPackedPreview(calculatePackedShapeLayout(rollW, rollL, boxWidth, height, qty), {
      ...trapConfig,
      strategyName: "Direct trapezoid panel",
      strategyNote:
        "The finished part is a trapezoid panel, so the preview keeps the actual panel shape for each cut.",
    }),
    rollW,
    rollL
  )

  const avgWidth = (topWidth + bottomWidth) / 2
  const checker = withWaste(
    buildPackedPreview(
      calculatePackedShapeLayout(rollW, rollL, boxWidth, height, qty, {
        stepX: Math.max(avgWidth, 2),
        stepY: height,
        flipPattern: "checker",
      }),
      {
        ...trapConfig,
        strategyName: "Head-to-tail trapezoid nesting",
        strategyNote:
          "Trapezoids alternate taper direction so the wider and narrower edges interlock, reducing gap waste.",
      }
    ),
    rollW,
    rollL
  )

  const bestTrap = chooseBestPreview([
    { ...direct, adjustedWaste: rollArea > 0 ? (direct.scrapArea / rollArea) * 100 : 100 },
    { ...checker, adjustedWaste: rollArea > 0 ? (checker.scrapArea / rollArea) * 100 : 100 },
  ])

  const directCutPlan = buildTrapezoidSteps(topWidth, bottomWidth, height)

  return {
    ...bestTrap,
    cutDirection,
    profileItem: {
      x: 0,
      y: 0,
      width: boxWidth,
      height,
      renderShape: "trapezoid",
      label: trapLabel,
      cutDirection,
      topWidth,
      bottomWidth,
    },
    cutPlanTitle: directCutPlan.title,
    cutSteps: directCutPlan.steps,
  }
}
