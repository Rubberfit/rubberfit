// Dimension label component for NestingVisualizer SVG
// Extracted from nesting-viz-simple-parts.tsx to stay under the max-lines limit

import React from "react"
import { formatInches } from "./nesting-viz-simple-layout"
import type { SimpleModeLayout } from "./nesting-viz-simple-layout"

export function SimpleModeDimensionLabels({ layout }: { layout: SimpleModeLayout }) {
  // When displayRotated, the visual horizontal edge of the sheet is
  // the original length and the visual vertical edge is the original
  // width. Swap value+label together so "12" length" reads correctly.
  const horzValue = layout.displayRotated ? layout.previewRollL : layout.previewRollW
  const horzLabel = layout.displayRotated ? "length" : "width"
  const vertValue = layout.displayRotated ? layout.previewRollW : layout.previewRollL
  const vertLabel = layout.displayRotated ? "width" : "length"

  // Line endpoints anchor to the rendered surface (effSurface*),
  // which equals surface* when not rotated.
  const horzVertY = layout.shapeFirstView
    ? layout.localBlankY + layout.localBlankH / 2
    : layout.effSurfaceY + layout.effSurfacePxH / 2

  return (
    <>
      <line
        x1={layout.shapeFirstView ? layout.localBlankX : layout.effSurfaceX}
        y1={layout.rowLabelY}
        x2={
          layout.shapeFirstView
            ? layout.localBlankX + layout.localBlankW
            : layout.effSurfaceX + layout.effSurfacePxW
        }
        y2={layout.rowLabelY}
        className="stroke-muted-foreground"
        strokeWidth="1.5"
        markerStart={`url(#${layout.markerId})`}
        markerEnd={`url(#${layout.markerId})`}
      />
      <text
        x={
          layout.shapeFirstView
            ? layout.localBlankX + layout.localBlankW / 2
            : layout.effSurfaceX + layout.effSurfacePxW / 2
        }
        y={layout.rowLabelY + 24}
        textAnchor="middle"
        className="fill-foreground"
        fontSize="14"
        fontWeight="600"
      >
        {`${formatInches(horzValue)}" ${horzLabel}`}
      </text>

      <line
        x1={layout.colLabelX}
        y1={layout.shapeFirstView ? layout.localBlankY : layout.effSurfaceY}
        x2={layout.colLabelX}
        y2={
          layout.shapeFirstView
            ? layout.localBlankY + layout.localBlankH
            : layout.effSurfaceY + layout.effSurfacePxH
        }
        className="stroke-muted-foreground"
        strokeWidth="1.5"
        markerStart={`url(#${layout.markerId})`}
        markerEnd={`url(#${layout.markerId})`}
      />
      <text
        x={layout.colLabelX + 26}
        y={horzVertY}
        textAnchor="middle"
        className="fill-foreground"
        fontSize="14"
        fontWeight="600"
        transform={`rotate(90 ${layout.colLabelX + 26} ${horzVertY})`}
      >
        {`${formatInches(vertValue)}" ${vertLabel}`}
      </text>
    </>
  )
}
