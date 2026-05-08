"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Layer, Rect, Stage } from "react-konva"

import GridLines from "./konva-grid-lines"
import PartShape, { type PartClick, type PartDragEnd, type PartDragMove } from "./konva-part-shape"
import RegionShape from "./konva-region-shape"
import { useKonvaTheme } from "./konva-theme"
import type { LayoutModel } from "./layout-model"

interface KonvaSheetRendererProps {
  layout: LayoutModel
  className?: string
  /**
   * When set, each rendered part is draggable; the callback fires on
   * drag end with the new position in sheet inches. Omitting the
   * prop leaves the canvas read-only (Auto-nest Graph surface).
   */
  onPartDragEnd?: PartDragEnd
  /**
   * Fires continuously during drag — pointer-move rate. Use for
   * adaptive offcut/waste recomputation; callers should rAF-throttle
   * anything expensive (e.g. Clipper polygon diffs).
   */
  onPartDragMove?: PartDragMove
  /** Currently-selected part id — renders with a highlight stroke. */
  selectedPartId?: string | null
  /** Fires when a part is clicked / tapped. */
  onPartClick?: PartClick
  /** Fires when the empty sheet (not a part) is clicked. Useful for clearing selection. */
  onSheetClick?: () => void
  /**
   * Sheet base fill. `"neutral"` (default) paints the stone-100 sheet
   * — the Auto-nest look where offcut / scrap regions render on top
   * as classified overlays. `"offcut"` paints the sheet in the
   * reusable amber color, so any area not covered by a part or a
   * scrap overlay is visually classified as reusable by default —
   * matches the Free-roam semantic where an empty sheet IS one big
   * reusable offcut.
   */
  sheetBase?: "neutral" | "offcut"
  /**
   * Whether to render `layout.offcuts` as classified overlay shapes.
   * Defaults to `true` when `sheetBase="neutral"` and `false` when
   * `sheetBase="offcut"` — when the sheet background is already amber,
   * an amber-on-amber overlay only adds rectangle outlines that read
   * as visual noise. Override with an explicit boolean if a consumer
   * wants the non-default behavior on either base.
   */
  shouldRenderOffcutRegions?: boolean
  /**
   * User zoom percentage applied on top of the auto-fit scale.
   * 100 = fit-to-container (default); 200 = 2× that fit. Values
   * outside [25, 400] are clamped by the toolbar before they reach
   * this prop. Content that overflows the stage at high zoom is
   * clipped — pan support lands with the Hand tool later.
   */
  zoomPct?: number
  /** Render the 12" grid. Default true. */
  showGrid?: boolean
}

function KonvaSheetRenderer({
  layout,
  className,
  onPartDragEnd,
  onPartDragMove,
  selectedPartId,
  onPartClick,
  onSheetClick,
  sheetBase = "neutral",
  shouldRenderOffcutRegions,
  zoomPct = 100,
  showGrid = true,
}: KonvaSheetRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const theme = useKonvaTheme()
  // Default: hide offcut overlays when base is already amber. JSDoc
  // on the prop carries the full rationale.
  const showOffcutRegions = shouldRenderOffcutRegions ?? sheetBase !== "offcut"

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Auto-fit: the largest scale at which the sheet fits inside the
  // container (with a small inset so the sheet isn't flush with the
  // chrome). User zoom is applied on top — zoomPct=100 matches the
  // historical behavior, zoomPct=200 renders at 2× auto-fit, etc.
  const autoFitScale =
    size.w > 0 && size.h > 0
      ? Math.min(size.w / layout.sheetWidth, size.h / layout.sheetLength) * 0.96
      : 0
  const scale = autoFitScale * (zoomPct / 100)

  const stageW = Math.round(layout.sheetWidth * scale)
  const stageH = Math.round(layout.sheetLength * scale)
  const offsetX = Math.max(0, (size.w - stageW) / 2)
  const offsetY = Math.max(0, (size.h - stageH) / 2)

  return (
    <div ref={containerRef} className={className ?? "w-full h-full"}>
      {scale > 0 && (
        <Stage width={size.w} height={size.h} style={{ display: "block" }}>
          <Layer x={offsetX} y={offsetY}>
            {/* Sheet background — clicking clears selection. Fill
                tracks `sheetBase`: the Auto-nest surface stays
                neutral grey, the Free-roam surface paints amber so
                any uncovered area is visually reusable by default. */}
            <Rect
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill={sheetBase === "offcut" ? theme.offcutFill : theme.sheetFill}
              stroke={theme.sheetStroke}
              strokeWidth={1}
              onMouseDown={() => onSheetClick?.()}
              onTap={() => onSheetClick?.()}
            />

            {/* Grid — hidden when the toolbar toggle is off */}
            {showGrid && (
              <GridLines
                sheetW={layout.sheetWidth}
                sheetL={layout.sheetLength}
                scale={scale}
                stroke={theme.grid}
              />
            )}

            {/* Reusable offcut — amber. Gated by `shouldRenderOffcutRegions`. */}
            {showOffcutRegions &&
              layout.offcuts.map((region, i) => (
                <RegionShape
                  key={`offcut-${i}`}
                  region={region}
                  scale={scale}
                  fill={theme.offcutFill}
                  stroke={theme.offcutStroke}
                />
              ))}

            {/* Scrap / waste — red */}
            {layout.scrap.map((region, i) => (
              <RegionShape
                key={`scrap-${i}`}
                region={region}
                scale={scale}
                fill={theme.scrapFill}
                stroke={theme.scrapStroke}
              />
            ))}

            {/* Parts — flat at rest, elevated on hover/selected/drag.
                The `realistic` boolean is gone; PartShape decides
                elevation from its own interaction state (issue
                phase-5 PR 2). */}
            {layout.parts.map((part) => (
              <PartShape
                key={part.id}
                part={part}
                scale={scale}
                fill={theme.partFills[part.specIndex % theme.partFills.length]}
                theme={theme}
                isDark={theme.isDark}
                isDraggable={typeof onPartDragEnd === "function"}
                isSelected={selectedPartId === part.id}
                onDragEnd={onPartDragEnd}
                onDragMove={onPartDragMove}
                onClick={onPartClick}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  )
}

/**
 * Memoized so the renderer's body skips re-execution when the parent
 * re-renders without changing any visible prop (issue #140 / ARC-91
 * Fix C-4). Default shallow compare is sufficient because:
 *   - `layout` ref is stable across drag ticks when content-equal
 *     (see `useFreeRoamLayout`'s `layoutCache` bailout).
 *   - `zoomPct`, `showGrid`, `selectedPartId`, `sheetBase`,
 *     `shouldRenderOffcutRegions` are primitives.
 *   - Handler props are `useCallback`'d in `free-roam-content.tsx`.
 */
export default memo(KonvaSheetRenderer)
