// Layout, scoring, and strategy utilities for NestingVisualizer
// Offcut/placement utilities are in nesting-offcut-utils.ts
// Rect/circle layout calculators are in nesting-rect-layout.ts
// Packing algorithms are in nesting-packing-utils.ts
// Step builders are in nesting-step-builders.ts

import type {
  DiagDir,
  GrainDir,
  MultiSheetResult,
  OffcutBand,
  PreviewItem,
  ScoredStrategy,
  SimpleCutDirection,
  SimplePartPreview,
  Strategy,
  StratMethod,
} from "./nesting-visualizer-types"
import { getPlacementBounds } from "./nesting-offcut-utils"

// SVG helpers
export const NS = "http://www.w3.org/2000/svg"

export function se(tag: string, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  if (parent) parent.appendChild(e)
  return e
}

export function st(txt: string, attrs: Record<string, string | number> = {}, parent?: Element) {
  const e = se(
    "text",
    {
      "font-size": "9",
      "font-family": "'DM Mono',monospace",
      fill: "#64748b",
      ...attrs,
    },
    parent
  )
  e.textContent = txt
  return e
}

// Layout / scoring helpers
export function calcLayout(rollW: number, rollL: number, cw: number, ch: number) {
  const cols = Math.floor(rollW / cw)
  const rows = Math.floor(rollL / ch)
  const rects = cols * rows
  const waste = rollW * rollL > 0 ? (1 - (rects * cw * ch) / (rollW * rollL)) * 100 : 100
  return { cols, rows, rects, waste, vCuts: cols - 1, hCuts: rows - 1 }
}

export function scoreStrat(
  s: Strategy,
  rollW: number,
  rollL: number,
  qty: number,
  grain: GrainDir
): ScoredStrategy {
  const L = calcLayout(rollW, rollL, s.cutW, s.cutH)
  const pieces = s.method === "diag" ? L.rects * 2 : L.rects
  let score = 100
  const reasons: { p: "p" | "w" | "f"; t: string }[] = []

  // grain
  if (grain === "width" && s.cutH > s.cutW) {
    score -= 45
    reasons.push({ p: "f", t: "Grain conflict — crosses roll width grain." })
  } else if (grain === "length" && s.cutW > s.cutH) {
    score -= 45
    reasons.push({ p: "f", t: "Grain conflict — crosses roll length grain." })
  } else if (grain !== "none") reasons.push({ p: "p", t: "Grain direction preserved." })

  // waste
  score += Math.max(0, 30 - L.waste)
  if (L.waste < 5)
    reasons.push({ p: "p", t: `${L.waste.toFixed(1)}% edge waste — excellent yield.` })
  else if (L.waste < 20) reasons.push({ p: "p", t: `${L.waste.toFixed(1)}% edge waste — good.` })
  else reasons.push({ p: "w", t: `${L.waste.toFixed(1)}% edge waste — consider resizing.` })

  // feed
  if (s.primaryDir === "horizontal") {
    score += 12
    reasons.push({ p: "p", t: "Primary cuts run parallel to roll feed — easier." })
  } else reasons.push({ p: "w", t: "Primary cuts run across the roll width." })

  // diagonal bonus
  if (s.method === "diag") {
    score += 8
    reasons.push({ p: "p", t: "Diagonal yields 2× pieces per rect — both triangles kept." })
    if (s.diagType === "corner") {
      const a = Math.atan2(s.cutH, s.cutW) * (180 / Math.PI)
      if (Math.abs(a - 45) < 5)
        reasons.push({ p: "p", t: `${a.toFixed(1)}° — equal right triangles.` })
      else reasons.push({ p: "w", t: `${a.toFixed(1)}° — unequal triangles, label A & B.` })
    }
  }

  // qty
  if (pieces < qty) {
    score -= 30
    reasons.push({ p: "f", t: `${pieces} pieces < ${qty} needed — second roll required.` })
  } else reasons.push({ p: "p", t: `${pieces} pieces — meets qty of ${qty}.` })

  return {
    ...s,
    ...L,
    pieces,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  }
}

export function getStrategies(cw: number, ch: number, ang: number, ddir: DiagDir): Strategy[] {
  return [
    {
      id: "rows-first",
      name: "Horizontal strips",
      sub: "H-cuts first (\u2190\u2192), then V-cuts (\u2195)",
      method: "rect" as StratMethod,
      cutW: cw,
      cutH: ch,
      primaryDir: "horizontal",
      icon: "H",
      steps: ["Full roll", "H-cuts first", "V-cuts next", "Done"],
    },
    {
      id: "cols-first",
      name: "Vertical strips",
      sub: "V-cuts first (\u2195), then H-cuts (\u2190\u2192)",
      method: "rect" as StratMethod,
      cutW: cw,
      cutH: ch,
      primaryDir: "vertical",
      icon: "V",
      steps: ["Full roll", "V-cuts first", "H-cuts next", "Done"],
    },
    {
      id: "landscape",
      name: "Rotated 90\u00b0",
      sub: `Piece turned \u2014 ${ch}"\u00d7${cw}" on roll`,
      method: "rect" as StratMethod,
      cutW: ch,
      cutH: cw,
      primaryDir: "horizontal",
      icon: "R",
      steps: ["Full roll", "H-cuts first", "V-cuts next", "Done"],
    },
    {
      id: "diag-corner",
      name: "Corner diagonal",
      sub: `${Math.round((Math.atan2(ch, cw) * 180) / Math.PI)}\u00b0 corner-to-corner`,
      method: "diag" as StratMethod,
      cutW: cw,
      cutH: ch,
      primaryDir: "horizontal",
      diagType: "corner",
      ddir,
      icon: "\u2571",
      steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"],
    },
    {
      id: "diag-custom",
      name: `Custom ${ang}\u00b0 diag`,
      sub: `${ddir === "ltr" ? "\u2571 left-to-right" : "\u2572 right-to-left"} at ${ang}\u00b0`,
      method: "diag" as StratMethod,
      cutW: cw,
      cutH: ch,
      primaryDir: "horizontal",
      diagType: "custom",
      diagAngle: ang,
      ddir,
      icon: "\u2220",
      steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"],
    },
    {
      id: "diag-land",
      name: "Rotated + diagonal",
      sub: "90\u00b0 rotation then diagonal split",
      method: "diag" as StratMethod,
      cutW: ch,
      cutH: cw,
      primaryDir: "horizontal",
      diagType: "corner",
      ddir,
      icon: "\u2572",
      steps: ["Full roll", "Straight cuts", "Diagonal cuts", "Done"],
    },
  ]
}

export function formatInches(value: number) {
  if (Number.isInteger(value)) {
    return String(value)
  }

  return value
    .toFixed(4)
    .replace(/\.00$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1")
}

export function normalizeCutRatios(cutRatios: number[] | undefined, count: number) {
  if (count <= 0) {
    return []
  }

  const safeFallback = Array.from({ length: count }, () => 1 / count)
  if (!cutRatios || cutRatios.length !== count) {
    return safeFallback
  }

  const cleaned = cutRatios.map((value) => (Number.isFinite(value) && value > 0 ? value : 0))
  const total = cleaned.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return safeFallback
  }

  return cleaned.map((value) => value / total)
}

export function buildCutBreakpoints(ratios: number[]) {
  let running = 0
  return ratios.slice(0, -1).map((ratio) => {
    running += ratio
    return running
  })
}

export function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

type RectPlacement = { x: number; y: number; width: number; height: number }

function rotatePointForLongStockDisplay(point: { x: number; y: number }, rollW: number) {
  return { x: point.y, y: rollW - point.x }
}

export function rotateRectForLongStockDisplay<T extends RectPlacement>(item: T, rollW: number): T {
  return {
    ...item,
    x: item.y,
    y: rollW - item.x - item.width,
    width: item.height,
    height: item.width,
  }
}

function rotateOffcutBandForLongStockDisplay(band: OffcutBand, rollW: number): OffcutBand {
  const rotated = rotateRectForLongStockDisplay(band, rollW)
  return {
    ...rotated,
    ...(band.polygon
      ? { polygon: band.polygon.map((point) => rotatePointForLongStockDisplay(point, rollW)) }
      : {}),
  }
}

export function rotatePreviewItemForLongStockDisplay(
  item: PreviewItem,
  rollW: number
): PreviewItem {
  const rotatedItem = rotateRectForLongStockDisplay(item, rollW)

  if (item.placedPolygon && item.placedPolygon.length > 0) {
    return {
      ...rotatedItem,
      placedPolygon: item.placedPolygon.map((point) =>
        rotatePointForLongStockDisplay(point, rollW)
      ),
    }
  }

  if (item.renderShape === "trapezoid") {
    const topW = item.topWidth ?? item.width
    const botW = item.bottomWidth ?? item.width
    const points = item.flipped
      ? [
          { x: item.x + (item.width - botW) / 2, y: item.y },
          { x: item.x + (item.width + botW) / 2, y: item.y },
          { x: item.x + (item.width + topW) / 2, y: item.y + item.height },
          { x: item.x + (item.width - topW) / 2, y: item.y + item.height },
        ]
      : [
          { x: item.x + (item.width - topW) / 2, y: item.y },
          { x: item.x + (item.width + topW) / 2, y: item.y },
          { x: item.x + (item.width + botW) / 2, y: item.y + item.height },
          { x: item.x + (item.width - botW) / 2, y: item.y + item.height },
        ]
    return {
      ...rotatedItem,
      placedPolygon: points.map((point) => rotatePointForLongStockDisplay(point, rollW)),
    }
  }

  if (item.renderShape === "sector") {
    const innerR = item.innerRadius ?? 0
    const outerR = item.outerRadius ?? 0
    const arcDeg = item.arcDegrees ?? 120
    const halfArc = (arcDeg * Math.PI) / 360
    const flipSign = item.flipped ? -1 : 1
    const arcAngleOffset = item.rotated90 ? Math.PI / 2 : 0
    const cx = item.rotated90 ? item.x + item.width - outerR : item.x + item.width / 2
    const cy = item.rotated90 ? item.y + item.height / 2 : item.y + outerR
    const a1 = -Math.PI / 2 - halfArc * flipSign + arcAngleOffset
    const a2 = -Math.PI / 2 + halfArc * flipSign + arcAngleOffset
    const segments = 32
    const points: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= segments; i++) {
      const a = a1 + (i / segments) * (a2 - a1)
      points.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) })
    }
    for (let i = 0; i <= segments; i++) {
      const a = a2 + (i / segments) * (a1 - a2)
      points.push({ x: cx + innerR * Math.cos(a), y: cy + innerR * Math.sin(a) })
    }
    return {
      ...rotatedItem,
      placedPolygon: points.map((point) => rotatePointForLongStockDisplay(point, rollW)),
    }
  }

  return rotatedItem
}

export function rotateSimplePartPreviewForLongStockDisplay(
  preview: SimplePartPreview,
  rollW: number
): SimplePartPreview {
  const items = preview.items.map((item) => rotatePreviewItemForLongStockDisplay(item, rollW))
  const bounds = getPlacementBounds(items)
  const profileItem = preview.profileItem
    ? rotatePreviewItemForLongStockDisplay(preview.profileItem, rollW)
    : preview.profileItem

  const rotatedPreview = {
    ...preview,
    items,
    profileItem,
    offcutBands: preview.offcutBands.map((band) =>
      rotateOffcutBandForLongStockDisplay(band, rollW)
    ),
    scrapBands: preview.scrapBands.map((band) => rotateOffcutBandForLongStockDisplay(band, rollW)),
    occupiedWidth: bounds.occupiedWidth,
    occupiedHeight: bounds.occupiedHeight,
  }

  if (rotatedPreview.renderShape === "circle") return rotatedPreview

  return {
    ...rotatedPreview,
    placements: items,
  }
}

export function rotateMultiSheetResultForLongStockDisplay(
  result: MultiSheetResult,
  rollW: number
): MultiSheetResult {
  return {
    ...result,
    sheets: result.sheets.map((sheet) => ({
      ...sheet,
      preview: rotateSimplePartPreviewForLongStockDisplay(sheet.preview, rollW),
    })),
  }
}

export function isConeRadialSplit(direction?: SimpleCutDirection) {
  return direction !== "arc_bands" && direction !== "horizontal_split"
}

export function isCylinderPanelSplit(direction?: SimpleCutDirection) {
  return direction !== "wrap_bands" && direction !== "horizontal_split"
}

export function isTrapezoidVerticalSplit(direction?: SimpleCutDirection) {
  return direction !== "horizontal_split" && direction !== "arc_bands"
}

// Re-export offcut/placement utilities from their new module
export {
  buildRowCounts,
  buildRectPlacements,
  buildOriginRectOffcutBands,
  buildShelfGapBands,
  countPieceFitsInBand,
  isReusableOffcutBand,
  bandFitsAnyPreviewItem,
  computeIntraBlankWaste,
  getPlacementBounds,
  centerPlacements,
  buildOffcutBands,
} from "./nesting-offcut-utils"

// Re-export packing utilities from their new module
export {
  sortPreviewItems,
  packPreviewItemsOnShelves,
  packPreviewItemsInCenteredColumn,
  packRectItemsWithGuillotine,
  calculatePackedShapeLayout,
} from "./nesting-packing-utils"

// Re-export rect/circle layout utilities from their new module
export {
  buildRectLayoutCandidate,
  calculateSimpleRectLayout,
  _calculateSimpleCircleLayout,
  calculateDirectCircleProfileLayout,
} from "./nesting-rect-layout"

// Re-export step builders from their new module
export {
  buildRectangleSteps,
  buildCircleSteps,
  buildCylinderSteps,
  buildConeSteps,
  buildTrapezoidSteps,
} from "./nesting-step-builders"
