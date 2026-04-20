"use client"

import { useEffect, useId, useMemo } from "react"

// Re-export types needed by external consumers
export type { SimplePartType, SimpleCutDirection } from "./nesting-visualizer-types"

import type {
  MultiSheetResult,
  PreviewItem,
  SheetPreview,
  SimpleCutMetrics,
  SimplePartPreview,
} from "./nesting-visualizer-types"

import { computeFabricationScore } from "./nesting-preview-builders"
import NestingVizSimpleMode from "./nesting-viz-simple-mode"

// ── 90° CW rotation utilities ───────────────────────────────────────────────

function rotateItem90CW<T extends { x: number; y: number; width: number; height: number }>(
  item: T,
  rollL: number
): T {
  return {
    ...item,
    x: rollL - item.y - item.height,
    y: item.x,
    width: item.height,
    height: item.width,
  }
}

function rotatePreviewItem(item: PreviewItem, rollL: number): PreviewItem {
  const rotatePt = (pt: { x: number; y: number }) => ({ x: rollL - pt.y, y: pt.x })
  if (item.placedPolygon && item.placedPolygon.length > 0) {
    return { ...rotateItem90CW(item, rollL), placedPolygon: item.placedPolygon.map(rotatePt) }
  }
  if (item.renderShape === "trapezoid") {
    const topW = item.topWidth ?? item.width
    const botW = item.bottomWidth ?? item.width
    const pts = item.flipped
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
    return { ...rotateItem90CW(item, rollL), placedPolygon: pts.map(rotatePt) }
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
    const pts: Array<{ x: number; y: number }> = []
    for (let i = 0; i <= segments; i++) {
      const a = a1 + (i / segments) * (a2 - a1)
      pts.push({ x: cx + outerR * Math.cos(a), y: cy + outerR * Math.sin(a) })
    }
    for (let i = 0; i <= segments; i++) {
      const a = a2 + (i / segments) * (a1 - a2)
      pts.push({ x: cx + innerR * Math.cos(a), y: cy + innerR * Math.sin(a) })
    }
    return { ...rotateItem90CW(item, rollL), placedPolygon: pts.map(rotatePt) }
  }
  return rotateItem90CW(item, rollL)
}

function rotateSimplePartPreview(preview: SimplePartPreview, rollL: number): SimplePartPreview {
  const rotBand = (b: { x: number; y: number; width: number; height: number }) =>
    rotateItem90CW(b, rollL)
  return {
    ...preview,
    items: preview.items.map((item) => rotatePreviewItem(item, rollL)),
    offcutBands: preview.offcutBands.map(rotBand),
    scrapBands: preview.scrapBands.map(rotBand),
  }
}

function rotateMultiSheetResult(result: MultiSheetResult, rollL: number): MultiSheetResult {
  return {
    ...result,
    sheets: result.sheets.map((sheet) => ({
      ...sheet,
      preview: rotateSimplePartPreview(sheet.preview, rollL),
    })),
  }
}

function indexToTag(i: number): string {
  let tag = ""
  let n = i
  do {
    tag = String.fromCharCode(65 + (n % 26)) + tag
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return tag
}

function buildTagMap(
  basePreview: SimplePartPreview | null,
  multiSheet: MultiSheetResult | null
): Map<string, string> {
  if (!basePreview && !multiSheet) return new Map()
  const seenIndices: number[] = []
  const specPartNumbers = new Map<number, string>()
  const collectItem = (item: PreviewItem) => {
    const idx = item.specIndex
    if (idx != null && !seenIndices.includes(idx)) {
      seenIndices.push(idx)
      if (item.partNumber) specPartNumbers.set(idx, item.partNumber)
    }
  }
  if (multiSheet) {
    multiSheet.sheets.forEach((sheet: SheetPreview) => sheet.preview.items.forEach(collectItem))
  } else if (basePreview) {
    basePreview.items.forEach(collectItem)
  }
  seenIndices.sort((a, b) => a - b)
  let fallbackCounter = 0
  return new Map(
    seenIndices.map((idx) => {
      const partNumber = specPartNumbers.get(idx)
      return [String(idx), partNumber ?? indexToTag(fallbackCounter++)]
    })
  )
}

function deriveMetrics(
  preview: SimplePartPreview,
  multiSheet: MultiSheetResult | null,
  rollWidth: number,
  rollLength: number
): SimpleCutMetrics {
  if (multiSheet && multiSheet.sheets.length > 1) {
    const totalPieces = multiSheet.sheets.reduce((s, sh) => s + sh.preview.piecesShown, 0)
    return {
      partsCompleted: multiSheet.totalUnitsCompleted,
      cutPieces: totalPieces,
      materialUsedSqFt: multiSheet.totalUsedArea / 144,
      reusableOffsetSqFt: multiSheet.totalReusableArea / 144,
      scrapSqFt: multiSheet.totalScrapArea / 144,
      fabScore: multiSheet.avgFabScore / 100,
    }
  }
  const rawScore =
    preview.fabricationScore ?? computeFabricationScore(preview, rollWidth, rollLength).score
  return {
    partsCompleted: preview.unitsCompleted,
    cutPieces: preview.piecesShown,
    materialUsedSqFt: preview.usedArea / 144,
    reusableOffsetSqFt: preview.reusableArea / 144,
    scrapSqFt: preview.scrapArea / 144,
    fabScore: rawScore / 100,
  }
}

export interface NestingVisualizerProps {
  /** Single-sheet preview. Provide this OR multiSheet, not both (multiSheet wins). */
  preview?: SimplePartPreview
  /** Multi-sheet result from a mixed-engine pack. Takes precedence over preview. */
  multiSheet?: MultiSheetResult
  /** Roll/stock width in inches — used for rotation and rendering. */
  rollWidth: number
  /** Roll/stock length in inches. */
  rollLength: number
  onMetricsChange?: (metrics: SimpleCutMetrics) => void
  onTagMapChange?: (tagMap: Map<string, string>) => void
}

export default function NestingVisualizer({
  preview,
  multiSheet,
  rollWidth,
  rollLength,
  onMetricsChange,
  onTagMapChange,
}: NestingVisualizerProps) {
  const patternSeed = useId().replace(/:/g, "")

  const shouldRotate = rollLength > rollWidth

  const effectiveMultiSheet = multiSheet ?? null
  const effectivePreview =
    effectiveMultiSheet?.sheets[0]?.preview ?? preview ?? null

  const rotatedMultiSheet = useMemo(
    () =>
      shouldRotate && effectiveMultiSheet
        ? rotateMultiSheetResult(effectiveMultiSheet, rollLength)
        : effectiveMultiSheet,
    [shouldRotate, effectiveMultiSheet, rollLength]
  )

  const rotatedPreview = useMemo(
    () =>
      shouldRotate && effectivePreview
        ? rotateSimplePartPreview(effectivePreview, rollLength)
        : effectivePreview,
    [shouldRotate, effectivePreview, rollLength]
  )

  const tagMap = useMemo(
    () => buildTagMap(effectivePreview, effectiveMultiSheet),
    [effectivePreview, effectiveMultiSheet]
  )

  useEffect(() => {
    if (!onMetricsChange || !effectivePreview) return
    try {
      onMetricsChange(
        deriveMetrics(effectivePreview, effectiveMultiSheet, rollWidth, rollLength)
      )
    } catch (_error) {
      // metrics computation failure must not break the visualizer
    }
  }, [effectivePreview, effectiveMultiSheet, rollWidth, rollLength, onMetricsChange])

  useEffect(() => {
    if (onTagMapChange && tagMap.size > 0) onTagMapChange(tagMap)
  }, [tagMap, onTagMapChange])

  if (!rotatedPreview) return null

  return (
    <NestingVizSimpleMode
      preview={rotatedPreview}
      previewRollW={shouldRotate ? rollLength : rollWidth}
      previewRollL={shouldRotate ? rollWidth : rollLength}
      wasRotated={shouldRotate}
      patternSeed={patternSeed}
      viewMode="stock"
      optimizedResult={null}
      optimizedItems={null}
      isOptimizing={false}
      nfpError={null}
      multiSheet={rotatedMultiSheet}
      tagMap={tagMap}
    />
  )
}
