// Shape-specific preview generators — basic shapes (rectangle, circle)
// Split from nesting-shape-previews.ts

import type { SimplePartPreview } from "./nesting-visualizer-types"
import {
  formatInches,
  buildOffcutBands,
  getPlacementBounds,
  calculateSimpleRectLayout,
  calculateDirectCircleProfileLayout,
  buildCircleSteps,
} from "./nesting-layout-utils"
import { calculatePackedShapeLayout } from "./nesting-packing-utils"
import {
  buildRectPreview,
  withWaste,
  chooseBestPreview,
  buildPackedPreview,
} from "./nesting-preview-builders"

export function generateRectanglePreview(
  rollW: number,
  rollL: number,
  width: number,
  length: number,
  qty: number
): SimplePartPreview {
  const rollArea = rollW * rollL
  const layout = calculateSimpleRectLayout(rollW, rollL, width, length, qty)
  const direct = withWaste(
    buildRectPreview(
      layout,
      layout.orientation === "rotated" ? "Rotated rectangle layout" : "Direct rectangle layout",
      layout.orientation === "rotated"
        ? "The piece was rotated automatically to fit the stock more efficiently."
        : "The finished part stays a rectangle, so the cut profile matches the part directly.",
      qty,
      1,
      width * length,
      `${formatInches(width)}" × ${formatInches(length)}"`
    ),
    rollW,
    rollL
  )

  const candidates = [
    { ...direct, adjustedWaste: rollArea > 0 ? (direct.scrapArea / rollArea) * 100 : 100 },
  ]

  return chooseBestPreview(candidates)
}

function buildDirectCircleCandidates(rollW: number, rollL: number, diameter: number, qty: number) {
  return [
    {
      strategyName: "Direct full-circle layout",
      strategyNote:
        "Keep each finished circle as one outside cut when the selected stock allows it cleanly.",
      mode: "hex" as const,
      strategyPenalty: 0,
    },
    {
      strategyName: "Direct grid-circle layout",
      strategyNote:
        "A straight full-circle grid is easier to read on the floor, but usually leaves a little more scrap than staggered placement.",
      mode: "grid" as const,
      strategyPenalty: 2,
    },
  ].map((candidate) => {
    const layout = calculateDirectCircleProfileLayout(rollW, rollL, diameter, qty, candidate.mode)
    const bounds = getPlacementBounds(layout.positions)
    const reusableBands = buildOffcutBands(bounds, rollW, rollL, "origin")
    const reusableArea = reusableBands.reduce((sum, band) => sum + band.width * band.height, 0)
    const occupiedArea = bounds.occupiedWidth * bounds.occupiedHeight
    const scrapArea = Math.max(0, occupiedArea - layout.usedArea)
    const wasteArea = reusableArea + scrapArea

    return {
      renderShape: "circle" as const,
      strategyName: candidate.strategyName,
      strategyNote: candidate.strategyNote,
      placementMode: "origin" as const,
      wasteMode: "bands" as const,
      cutPlanTitle: "Circle cut sequence",
      cutSteps: buildCircleSteps(diameter, 1).steps,
      requestedUnits: qty,
      unitsCompleted: layout.placed,
      overflowUnits: layout.overflow,
      piecesShown: layout.placed,
      piecesPerUnit: 1,
      usedArea: layout.usedArea,
      wasteArea,
      wastePct: rollW * rollL > 0 ? (wasteArea / (rollW * rollL)) * 100 : 100,
      reusableArea,
      scrapArea,
      occupiedWidth: bounds.occupiedWidth,
      occupiedHeight: bounds.occupiedHeight,
      items: layout.positions.map((position) => ({
        ...position,
        renderShape: "circle" as const,
        label: `Ø${formatInches(diameter)}"`,
        diameter,
      })),
      offcutBands: reusableBands,
      scrapBands: [],
      layout,
      diameter,
      adjustedWaste:
        (rollW * rollL > 0 ? (scrapArea / (rollW * rollL)) * 100 : 100) +
        (occupiedArea / Math.max(rollW * rollL, 1)) * 5 +
        candidate.strategyPenalty,
    }
  })
}

function buildPanelizedCircleCandidates(
  rollW: number,
  rollL: number,
  diameter: number,
  qty: number,
  radius: number,
  circleArea: number
) {
  return [
    {
      strategyName: "Two half-circle panels",
      strategyNote:
        "The circle is split across one centerline so two semicircle panels can be nested more tightly on stock.",
      piecesPerUnit: 2,
      arcDegrees: 180,
      footprintW: diameter,
      footprintH: radius,
      options: {
        stepX: diameter,
        stepY: radius,
        rowOffset: diameter / 2,
        alternateOffset: true,
        flipPattern: "row" as const,
      },
      strategyPenalty: 14,
    },
    {
      strategyName: "Three radial sectors",
      strategyNote:
        "The circle is divided into three wedge panels so the cut geometry is visible while still keeping waste reasonable.",
      piecesPerUnit: 3,
      arcDegrees: 120,
      footprintW: Math.max(2, 2 * radius * Math.sin(Math.PI / 3)),
      footprintH: radius,
      options: {
        stepX: Math.max(2, 2 * radius * Math.sin(Math.PI / 3) * 0.82),
        stepY: radius,
        rowOffset: radius * 0.5,
        alternateOffset: true,
        flipPattern: "checker" as const,
      },
      strategyPenalty: 22,
    },
    {
      strategyName: "Six wedge sectors",
      strategyNote:
        "The circle is cut into six smaller wedge panels, which can pack tightly and clearly show the geometric cut strategy.",
      piecesPerUnit: 6,
      arcDegrees: 60,
      footprintW: radius,
      footprintH: radius,
      options: {
        stepX: radius * 0.92,
        stepY: radius,
        rowOffset: radius * 0.46,
        alternateOffset: true,
        flipPattern: "checker" as const,
      },
      strategyPenalty: 38,
    },
  ].map((candidate) => {
    const packed = withWaste(
      buildPackedPreview(
        calculatePackedShapeLayout(
          rollW,
          rollL,
          candidate.footprintW,
          candidate.footprintH,
          qty * candidate.piecesPerUnit,
          candidate.options
        ),
        {
          renderShape: "sector",
          strategyName: candidate.strategyName,
          strategyNote: candidate.strategyNote,
          requestedUnits: qty,
          piecesPerUnit: candidate.piecesPerUnit,
          pieceArea: circleArea / candidate.piecesPerUnit,
          label: `${Math.round(candidate.arcDegrees)}° sector`,
          innerRadius: 0,
          outerRadius: radius,
          arcDegrees: candidate.arcDegrees,
        }
      ),
      rollW,
      rollL
    )

    return {
      ...packed,
      adjustedWaste:
        (rollW * rollL > 0 ? (packed.scrapArea / (rollW * rollL)) * 100 : 100) +
        ((packed.occupiedWidth * packed.occupiedHeight) / Math.max(rollW * rollL, 1)) * 8 +
        candidate.strategyPenalty,
    }
  })
}

export function generateCirclePreview(
  rollW: number,
  rollL: number,
  diameter: number,
  qty: number
): SimplePartPreview {
  const radius = diameter / 2
  const circleArea = Math.PI * radius * radius
  const heroLayout = calculateDirectCircleProfileLayout(diameter, diameter, diameter, 1)

  const directCircleCandidates = buildDirectCircleCandidates(rollW, rollL, diameter, qty)
  const panelizedCircleCandidates = buildPanelizedCircleCandidates(
    rollW,
    rollL,
    diameter,
    qty,
    radius,
    circleArea
  )

  const best = chooseBestPreview([...directCircleCandidates, ...panelizedCircleCandidates])
  const cutPlan = buildCircleSteps(diameter, best.piecesPerUnit)

  return {
    ...best,
    renderShape: "circle",
    cutPlanTitle: cutPlan.title,
    cutSteps: cutPlan.steps,
    layout: heroLayout,
    diameter,
  }
}
