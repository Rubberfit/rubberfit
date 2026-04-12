// Offcut band calculation and placement bounds utilities
// Split from nesting-layout-utils.ts to stay under the max-lines limit

import type { OffcutBand, PreviewItem, ShapePlacement } from "./nesting-visualizer-types"
import {
  MIN_REUSABLE_OFFCUT_WIDTH,
  MIN_REUSABLE_OFFCUT_HEIGHT,
  MIN_REUSABLE_STRIP_WIDTH,
  MIN_REUSABLE_STRIP_LENGTH,
} from "./nesting-visualizer-types"

export function buildRowCounts(placed: number, cols: number) {
  const rows = Math.ceil(placed / cols)
  return Array.from({ length: rows }, (_, rowIndex) => {
    if (rowIndex < rows - 1) {
      return cols
    }
    return placed - cols * (rows - 1)
  })
}

export function buildRectPlacements(pieceW: number, pieceH: number, rowCounts: number[]) {
  const placements: ShapePlacement[] = []
  rowCounts.forEach((count, rowIndex) => {
    for (let colIndex = 0; colIndex < count; colIndex += 1) {
      placements.push({
        x: colIndex * pieceW,
        y: rowIndex * pieceH,
        width: pieceW,
        height: pieceH,
      })
    }
  })
  return placements
}

export function buildOriginRectOffcutBands(
  placements: ShapePlacement[],
  rollW: number,
  rollL: number
) {
  if (placements.length === 0) {
    return []
  }

  const rows = new Map<number, { y: number; height: number; maxX: number }>()

  placements.forEach((placement) => {
    const existing = rows.get(placement.y)
    const maxX = placement.x + placement.width
    if (!existing) {
      rows.set(placement.y, {
        y: placement.y,
        height: placement.height,
        maxX,
      })
      return
    }

    existing.maxX = Math.max(existing.maxX, maxX)
    existing.height = Math.max(existing.height, placement.height)
  })

  const sortedRows = Array.from(rows.values()).sort((a, b) => a.y - b.y)
  const bands: OffcutBand[] = []

  sortedRows.forEach((row) => {
    const width = rollW - row.maxX
    if (width > 0.25) {
      bands.push({
        x: row.maxX,
        y: row.y,
        width,
        height: row.height,
      })
    }
  })

  const lastRow = sortedRows.at(-1)
  if (lastRow) {
    const bottomY = lastRow.y + lastRow.height
    const bottomHeight = rollL - bottomY
    if (bottomHeight > 0.25) {
      bands.push({
        x: 0,
        y: bottomY,
        width: rollW,
        height: bottomHeight,
      })
    }
  }

  return bands
}

export function buildShelfGapBands(placements: ShapePlacement[], rollW: number, rollL: number) {
  if (placements.length === 0) {
    return [] as OffcutBand[]
  }

  const rows = new Map<number, { y: number; height: number; placements: ShapePlacement[] }>()

  placements.forEach((placement) => {
    const existing = rows.get(placement.y)
    if (!existing) {
      rows.set(placement.y, {
        y: placement.y,
        height: placement.height,
        placements: [placement],
      })
      return
    }

    existing.height = Math.max(existing.height, placement.height)
    existing.placements.push(placement)
  })

  const bands: OffcutBand[] = []
  const sortedRows = Array.from(rows.values()).sort((a, b) => a.y - b.y)

  sortedRows.forEach((row) => {
    const sortedPlacements = [...row.placements].sort((a, b) => a.x - b.x)
    let rowMaxX = 0

    sortedPlacements.forEach((placement, idx) => {
      // Leading gap (first placement doesn't start at x=0)
      if (idx === 0 && placement.x > 0.25) {
        bands.push({ x: 0, y: row.y, width: placement.x, height: row.height })
      }
      // Inter-placement gap (gap between consecutive placements)
      if (idx > 0) {
        const prevEnd = sortedPlacements[idx - 1].x + sortedPlacements[idx - 1].width
        const gapWidth = placement.x - prevEnd
        if (gapWidth > 0.25) {
          bands.push({ x: prevEnd, y: row.y, width: gapWidth, height: row.height })
        }
      }
      rowMaxX = Math.max(rowMaxX, placement.x + placement.width)
      const underfillHeight = row.height - placement.height
      if (underfillHeight > 0.25) {
        bands.push({
          x: placement.x,
          y: placement.y + placement.height,
          width: placement.width,
          height: underfillHeight,
        })
      }
    })

    const trailingWidth = rollW - rowMaxX
    if (trailingWidth > 0.25) {
      bands.push({
        x: rowMaxX,
        y: row.y,
        width: trailingWidth,
        height: row.height,
      })
    }
  })

  const lastRow = sortedRows.at(-1)
  if (lastRow) {
    const bottomY = lastRow.y + lastRow.height
    const bottomHeight = rollL - bottomY
    if (bottomHeight > 0.25) {
      bands.push({
        x: 0,
        y: bottomY,
        width: rollW,
        height: bottomHeight,
      })
    }
  }

  return bands
}

export function countPieceFitsInBand(band: OffcutBand, pieceW: number, pieceH: number) {
  const direct = Math.floor(band.width / pieceW) * Math.floor(band.height / pieceH)
  const rotated =
    pieceW === pieceH ? direct : Math.floor(band.width / pieceH) * Math.floor(band.height / pieceW)
  return Math.max(direct, rotated)
}

export function isReusableOffcutBand(band: OffcutBand, pieceW?: number, pieceH?: number) {
  const matchesCurrentPiece =
    pieceW && pieceH ? countPieceFitsInBand(band, pieceW, pieceH) > 0 : false
  const matchesStandardOffcut =
    countPieceFitsInBand(band, MIN_REUSABLE_OFFCUT_WIDTH, MIN_REUSABLE_OFFCUT_HEIGHT) > 0
  const matchesReusableStrip =
    countPieceFitsInBand(band, MIN_REUSABLE_STRIP_LENGTH, MIN_REUSABLE_STRIP_WIDTH) > 0

  return matchesCurrentPiece || matchesStandardOffcut || matchesReusableStrip
}

export function bandFitsAnyPreviewItem(band: OffcutBand, items: PreviewItem[]) {
  return (
    items.some((item) => countPieceFitsInBand(band, item.width, item.height) > 0) ||
    isReusableOffcutBand(band)
  )
}

export function computeIntraBlankWaste(item: PreviewItem): number {
  const boxArea = item.width * item.height
  if (item.renderShape === "sector") {
    const arc = item.arcDegrees ?? 120
    const oR = item.outerRadius ?? 0
    const iR = item.innerRadius ?? 0
    return boxArea - (arc / 360) * Math.PI * (oR ** 2 - iR ** 2)
  }
  if (item.renderShape === "trapezoid") {
    const tW = item.topWidth ?? item.width
    const bW = item.bottomWidth ?? item.width
    return boxArea - ((tW + bW) / 2) * item.height
  }
  if (item.renderShape === "circle") {
    const d = item.diameter ?? item.width
    return boxArea - Math.PI * (d / 2) ** 2
  }
  return 0
}

export function getPlacementBounds(positions: ShapePlacement[]) {
  if (positions.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      occupiedWidth: 0,
      occupiedHeight: 0,
    }
  }

  const minX = Math.min(...positions.map((position) => position.x))
  const minY = Math.min(...positions.map((position) => position.y))
  const maxX = Math.max(...positions.map((position) => position.x + position.width))
  const maxY = Math.max(...positions.map((position) => position.y + position.height))

  return {
    minX,
    minY,
    maxX,
    maxY,
    occupiedWidth: maxX - minX,
    occupiedHeight: maxY - minY,
  }
}

export function centerPlacements(positions: ShapePlacement[], rollW: number, rollL: number) {
  if (positions.length === 0) {
    return {
      positions,
      occupiedWidth: 0,
      occupiedHeight: 0,
    }
  }

  const bounds = getPlacementBounds(positions)
  const offsetX = (rollW - bounds.occupiedWidth) / 2 - bounds.minX
  const offsetY = (rollL - bounds.occupiedHeight) / 2 - bounds.minY
  const centered = positions.map((position) => ({
    ...position,
    x: position.x + offsetX,
    y: position.y + offsetY,
  }))
  const centeredBounds = getPlacementBounds(centered)

  return {
    positions: centered,
    occupiedWidth: centeredBounds.occupiedWidth,
    occupiedHeight: centeredBounds.occupiedHeight,
  }
}

export function buildOffcutBands(
  bounds: ReturnType<typeof getPlacementBounds>,
  rollW: number,
  rollL: number,
  placementMode: "origin" | "center"
): OffcutBand[] {
  if (bounds.occupiedWidth <= 0 || bounds.occupiedHeight <= 0) {
    return []
  }

  const bands: OffcutBand[] = []
  const left = bounds.minX
  const right = rollW - bounds.maxX
  const top = bounds.minY
  const bottom = rollL - bounds.maxY

  if (placementMode === "origin") {
    if (right > 0.25) {
      bands.push({
        x: bounds.maxX,
        y: 0,
        width: right,
        height: bottom > 0.25 ? bounds.maxY : rollL,
      })
    }
    if (bottom > 0.25) {
      bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom })
    }
    return bands
  }

  if (top > 0.25) {
    bands.push({ x: 0, y: 0, width: rollW, height: top })
  }
  if (bottom > 0.25) {
    bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom })
  }
  if (left > 0.25) {
    bands.push({ x: 0, y: bounds.minY, width: left, height: bounds.occupiedHeight })
  }
  if (right > 0.25) {
    bands.push({ x: bounds.maxX, y: bounds.minY, width: right, height: bounds.occupiedHeight })
  }

  return bands
}
