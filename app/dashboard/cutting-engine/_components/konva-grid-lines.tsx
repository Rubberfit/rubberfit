"use client"

import { Line } from "react-konva"

interface GridLinesProps {
  sheetW: number
  sheetL: number
  scale: number
  stroke: string
}

/**
 * Static 12" interval grid over the sheet — orientation lines
 * (verticals every 12" inches across, horizontals every 12" down).
 * Pure render of derived constants; no memo needed since the parent
 * already memoizes the renderer body and the props it passes here
 * are primitives.
 */
export default function GridLines({ sheetW, sheetL, scale, stroke }: GridLinesProps) {
  const vLines: number[] = []
  for (let x = 12; x < sheetW; x += 12) vLines.push(x)
  const hLines: number[] = []
  for (let y = 12; y < sheetL; y += 12) hLines.push(y)

  return (
    <>
      {vLines.map((x) => (
        <Line
          key={`v${x}`}
          points={[x * scale, 0, x * scale, sheetL * scale]}
          stroke={stroke}
          strokeWidth={0.5}
          listening={false}
        />
      ))}
      {hLines.map((y) => (
        <Line
          key={`h${y}`}
          points={[0, y * scale, sheetW * scale, y * scale]}
          stroke={stroke}
          strokeWidth={0.5}
          listening={false}
        />
      ))}
    </>
  )
}
