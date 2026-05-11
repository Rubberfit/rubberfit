import { forwardRef } from "react"
import type { OffcutBand, PreviewItem, SheetPreview } from "./nesting-visualizer-types"
import type { LayoutModel } from "./layout-model"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"

interface SheetThumbnailProps {
  sheet: SheetPreview
  layoutModel?: LayoutModel
  totalSheets: number
  isActive: boolean
  onActivate: () => void
  /** Roving tabindex from the strip parent: 0 for the active thumbnail, -1 for the rest. */
  tabIndex: number
  /** Shared layout sizing computed by the parent so all thumbnails render at the same scale. */
  layout: SimpleModeLayout
}

/**
 * Phase 5 PR 6 — miniature decorative SheetSvg.
 *
 * Renders the sheet base + scrap + offcut + part geometry inside a
 * `<button>` so it's natively keyboard-activatable. Decorative:
 *
 * - No `data-sheet-svg` attribute. `cut-history-pdf.ts` queries
 *   `[data-sheet-svg]` to find detail SVGs for PDF capture; thumbnails
 *   must NOT match.
 * - No wheel / pointer / drag handlers, no zoom controls, no labels.
 * - Inner `<svg>` is `aria-hidden="true"` — the button's `aria-label`
 *   carries the semantics.
 * - No tag-letter `<text>` (illegible at 112px scale) and no part
 *   roles / tabindexes (parts here are NOT individually interactive;
 *   selection is detail-only per the design spec).
 *
 * Coordinate math matches `sheet-svg.tsx` exactly: scrap/offcut bands
 * use sheet-space (`surfaceX + x*scale`), parts use unit-origin space
 * (`surfaceX + (x - unitOriginX)*scale`). `displayRotated` is NOT
 * applied — thumbnails render in the canonical orientation so the
 * strip stays readable left-to-right even when the detail rotates.
 */
function scrapOrOffcutPolyPoints(band: OffcutBand, layout: SimpleModeLayout): string {
  if (band.polygon && band.polygon.length > 0) {
    return band.polygon
      .map(
        (pt) => `${layout.surfaceX + pt.x * layout.scale},${layout.surfaceY + pt.y * layout.scale}`
      )
      .join(" ")
  }
  const x = layout.surfaceX + band.x * layout.scale
  const y = layout.surfaceY + band.y * layout.scale
  const w = band.width * layout.scale
  const h = band.height * layout.scale
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`
}

function partPolyPoints(item: PreviewItem, layout: SimpleModeLayout): string {
  if (item.placedPolygon && item.placedPolygon.length > 0) {
    return item.placedPolygon
      .map(
        (pt) =>
          `${layout.surfaceX + (pt.x - layout.unitOriginX) * layout.scale},` +
          `${layout.surfaceY + (pt.y - layout.unitOriginY) * layout.scale}`
      )
      .join(" ")
  }
  const x = layout.surfaceX + (item.x - layout.unitOriginX) * layout.scale
  const y = layout.surfaceY + (item.y - layout.unitOriginY) * layout.scale
  const w = item.width * layout.scale
  const h = item.height * layout.scale
  return `${x},${y} ${x + w},${y} ${x + w},${y + h} ${x},${y + h}`
}

const SheetThumbnail = forwardRef<HTMLButtonElement, SheetThumbnailProps>(function SheetThumbnail(
  { sheet, layoutModel, totalSheets, isActive, onActivate, tabIndex, layout },
  ref
) {
  const partCount = layoutModel?.parts.length ?? 0
  const ariaLabel =
    `Sheet ${sheet.sheetIndex + 1} of ${totalSheets}, ` +
    `${partCount} ${partCount === 1 ? "part" : "parts"}` +
    (sheet.isPartial ? ", partial" : "")

  return (
    <button
      ref={ref}
      type="button"
      onClick={onActivate}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      className={
        "relative h-22 w-28 shrink-0 overflow-hidden rounded-sm bg-[var(--svg-page-bg)] " +
        "transition-colors motion-reduce:transition-none " +
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 " +
        "focus-visible:outline-ring " +
        (isActive ? "border-2 border-[var(--svg-part-selected-stroke)]" : "border border-border")
      }
    >
      <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        SHEET {sheet.sheetIndex + 1}
      </span>

      {sheet.isPartial && (
        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-amber-500"
        />
      )}

      <svg
        aria-hidden="true"
        viewBox={`0 0 ${layout.viewWidth} ${layout.viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full"
      >
        <rect
          x={layout.effSurfaceX}
          y={layout.effSurfaceY}
          width={layout.effSurfacePxW}
          height={layout.effSurfacePxH}
          fill="var(--svg-sheet-base)"
        />
        {!layout.shapeFirstView &&
          sheet.preview.scrapBands.map((band, i) => (
            <polygon
              key={`scrap-${i}`}
              points={scrapOrOffcutPolyPoints(band, layout)}
              fill="var(--svg-scrap-base)"
            />
          ))}
        {!layout.shapeFirstView &&
          sheet.preview.offcutBands.map((band, i) => (
            <polygon
              key={`offcut-${i}`}
              points={scrapOrOffcutPolyPoints(band, layout)}
              fill="var(--svg-offcut-fill)"
            />
          ))}
        {sheet.preview.items.map((item, i) => (
          <polygon
            key={`part-${i}`}
            points={partPolyPoints(item, layout)}
            fill="var(--svg-part-fill)"
          />
        ))}
      </svg>

      <span className="pointer-events-none absolute bottom-1 right-1.5 text-[10px] tabular-nums text-muted-foreground">
        {partCount} pts
      </span>
    </button>
  )
})

export default SheetThumbnail
