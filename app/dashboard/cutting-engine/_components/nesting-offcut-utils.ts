// Offcut band calculation and placement bounds utilities
// Split from nesting-layout-utils.ts to stay under the max-lines limit

import type { OffcutBand, PreviewItem, ShapePlacement } from "./nesting-visualizer-types"
import {
  MIN_REUSABLE_OFFCUT_WIDTH,
  MIN_REUSABLE_OFFCUT_HEIGHT,
  MIN_REUSABLE_STRIP_WIDTH,
  MIN_REUSABLE_STRIP_LENGTH,
} from "./nesting-visualizer-types"

const MIN_GAP_BAND_SIZE = 0.25
const BAND_TOUCH_EPS = 0.01

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
    if (width > MIN_GAP_BAND_SIZE) {
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
    if (bottomHeight > MIN_GAP_BAND_SIZE) {
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

function subtractPlacementFromBand(band: OffcutBand, placement: ShapePlacement): OffcutBand[] {
  const bx1 = band.x
  const bx2 = band.x + band.width
  const by1 = band.y
  const by2 = band.y + band.height
  const px1 = placement.x
  const px2 = placement.x + placement.width
  const py1 = placement.y
  const py2 = placement.y + placement.height

  const ox1 = Math.max(bx1, px1)
  const ox2 = Math.min(bx2, px2)
  const oy1 = Math.max(by1, py1)
  const oy2 = Math.min(by2, py2)
  if (ox1 >= ox2 || oy1 >= oy2) {
    return [band]
  }

  const result: OffcutBand[] = []
  if (ox1 - bx1 > MIN_GAP_BAND_SIZE) {
    result.push({ ...band, x: bx1, y: by1, width: ox1 - bx1, height: band.height })
  }
  if (bx2 - ox2 > MIN_GAP_BAND_SIZE) {
    result.push({ ...band, x: ox2, y: by1, width: bx2 - ox2, height: band.height })
  }
  if (oy1 - by1 > MIN_GAP_BAND_SIZE) {
    result.push({ ...band, x: ox1, y: by1, width: ox2 - ox1, height: oy1 - by1 })
  }
  if (by2 - oy2 > MIN_GAP_BAND_SIZE) {
    result.push({ ...band, x: ox1, y: oy2, width: ox2 - ox1, height: by2 - oy2 })
  }
  return result
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

  const candidateBands: OffcutBand[] = []
  const sortedRows = Array.from(rows.values()).sort((a, b) => a.y - b.y)

  sortedRows.forEach((row) => {
    const sortedPlacements = [...row.placements].sort((a, b) => a.x - b.x)
    let rowMaxX = 0

    sortedPlacements.forEach((placement, idx) => {
      if (idx === 0 && placement.x > MIN_GAP_BAND_SIZE) {
        candidateBands.push({ x: 0, y: row.y, width: placement.x, height: row.height })
      }
      if (idx > 0) {
        const prevEnd = sortedPlacements[idx - 1].x + sortedPlacements[idx - 1].width
        const gapWidth = placement.x - prevEnd
        if (gapWidth > MIN_GAP_BAND_SIZE) {
          candidateBands.push({ x: prevEnd, y: row.y, width: gapWidth, height: row.height })
        }
      }
      rowMaxX = Math.max(rowMaxX, placement.x + placement.width)
      const underfillHeight = row.height - placement.height
      if (underfillHeight > MIN_GAP_BAND_SIZE) {
        const underfillBand: OffcutBand = {
          x: placement.x,
          y: placement.y + placement.height,
          width: placement.width,
          height: underfillHeight,
        }
        if (isReusableOffcutBand(underfillBand)) {
          candidateBands.push(underfillBand)
        }
      }
    })

    const trailingWidth = rollW - rowMaxX
    if (trailingWidth > MIN_GAP_BAND_SIZE) {
      candidateBands.push({
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
    if (bottomHeight > MIN_GAP_BAND_SIZE) {
      candidateBands.push({
        x: 0,
        y: bottomY,
        width: rollW,
        height: bottomHeight,
      })
    }
  }

  const bands: OffcutBand[] = []
  for (const band of candidateBands) {
    let pieces: OffcutBand[] = [band]
    for (const placement of placements) {
      pieces = pieces.flatMap((p) => subtractPlacementFromBand(p, placement))
      if (pieces.length === 0) break
    }
    bands.push(...pieces)
  }

  return mergeVerticallyAdjacentBands(splitBandsAtCommonXEdges(bands))
}

export function splitBandsAtCommonXEdges(bands: OffcutBand[]): OffcutBand[] {
  if (bands.length <= 1) return bands
  // Same EPS as `mergeVerticallyAdjacentBands` so the bucket keys produced
  // there fold pieces emitted from these split points. Per-CodeRabbit on PR #130.
  const EPS = 0.01
  // Collect every band's left + right x-coords, then coalesce values within
  // EPS into a single representative — otherwise near-equal floats (e.g. 30
  // and 30.004 from independent placements) survive as distinct split points
  // and emit sub-EPS-width slivers downstream.
  const sortedXs = bands
    .flatMap((band) => [band.x, band.x + band.width])
    .sort((a, b) => a - b)
  const xs: number[] = []
  for (const x of sortedXs) {
    if (xs.length === 0 || x - xs[xs.length - 1] > EPS) xs.push(x)
  }

  const result: OffcutBand[] = []
  for (const band of bands) {
    const bandLeft = band.x
    const bandRight = band.x + band.width
    const interior = xs.filter((x) => x > bandLeft + EPS && x < bandRight - EPS)
    if (interior.length === 0) {
      result.push(band)
      continue
    }
    let prev = bandLeft
    for (const x of interior) {
      result.push({ ...band, x: prev, width: x - prev })
      prev = x
    }
    result.push({ ...band, x: prev, width: bandRight - prev })
  }
  return result
}

export function mergeVerticallyAdjacentBands(bands: OffcutBand[]): OffcutBand[] {
  if (bands.length <= 1) return bands
  const EPS = 0.01
  const buckets = new Map<string, OffcutBand[]>()
  for (const band of bands) {
    const key = `${Math.round(band.x / EPS)}|${Math.round(band.width / EPS)}`
    const bucket = buckets.get(key)
    if (bucket) bucket.push(band)
    else buckets.set(key, [band])
  }

  const merged: OffcutBand[] = []
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.y - b.y)
    let current: OffcutBand = { ...bucket[0] }
    for (let i = 1; i < bucket.length; i++) {
      const next = bucket[i]
      const currentEnd = current.y + current.height
      if (Math.abs(next.y - currentEnd) <= EPS) {
        current.height = next.y + next.height - current.y
      } else {
        merged.push(current)
        current = { ...next }
      }
    }
    merged.push(current)
  }
  return merged
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

export interface ClassifiedOffcutBands {
  offcutBands: OffcutBand[]
  scrapBands: OffcutBand[]
  reusableArea: number
  scrapArea: number
}

function bandsAreEdgeConnected(a: OffcutBand, b: OffcutBand): boolean {
  const ax2 = a.x + a.width
  const ay2 = a.y + a.height
  const bx2 = b.x + b.width
  const by2 = b.y + b.height
  const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x)
  const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y)

  return (
    (xOverlap > BAND_TOUCH_EPS && yOverlap >= -BAND_TOUCH_EPS) ||
    (yOverlap > BAND_TOUCH_EPS && xOverlap >= -BAND_TOUCH_EPS)
  )
}

export function classifyOffcutBands(
  bands: OffcutBand[],
  items: PreviewItem[]
): ClassifiedOffcutBands {
  const offcutBands: OffcutBand[] = []
  const scrapBands: OffcutBand[] = []
  const individuallyReusable = bands.map((band) => bandFitsAnyPreviewItem(band, items))
  const visited = new Array<boolean>(bands.length).fill(false)
  let reusableArea = 0
  let scrapArea = 0

  for (let start = 0; start < bands.length; start += 1) {
    if (visited[start]) continue
    const component: number[] = []
    const queue = [start]
    visited[start] = true

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]
      component.push(current)
      for (let next = 0; next < bands.length; next += 1) {
        if (visited[next] || !bandsAreEdgeConnected(bands[current], bands[next])) continue
        visited[next] = true
        queue.push(next)
      }
    }

    const isComponentReusable = component.some((index) => individuallyReusable[index])
    for (const index of component) {
      const band = bands[index]
      const area = band.width * band.height
      if (isComponentReusable) {
        offcutBands.push(band)
        reusableArea += area
      } else {
        scrapBands.push(band)
        scrapArea += area
      }
    }
  }

  return { offcutBands, scrapBands, reusableArea, scrapArea }
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
    if (right > MIN_GAP_BAND_SIZE) {
      bands.push({
        x: bounds.maxX,
        y: 0,
        width: right,
        height: bottom > MIN_GAP_BAND_SIZE ? bounds.maxY : rollL,
      })
    }
    if (bottom > MIN_GAP_BAND_SIZE) {
      bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom })
    }
    return bands
  }

  if (top > MIN_GAP_BAND_SIZE) {
    bands.push({ x: 0, y: 0, width: rollW, height: top })
  }
  if (bottom > MIN_GAP_BAND_SIZE) {
    bands.push({ x: 0, y: bounds.maxY, width: rollW, height: bottom })
  }
  if (left > MIN_GAP_BAND_SIZE) {
    bands.push({ x: 0, y: bounds.minY, width: left, height: bounds.occupiedHeight })
  }
  if (right > MIN_GAP_BAND_SIZE) {
    bands.push({ x: bounds.maxX, y: bounds.minY, width: right, height: bounds.occupiedHeight })
  }

  return bands
}
