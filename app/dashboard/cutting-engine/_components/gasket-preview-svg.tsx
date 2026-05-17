// app/dashboard/cutting-engine/_components/gasket-preview-svg.tsx
"use client"

import { useMemo } from "react"
import type { PolygonWithHoles } from "@/src/application/packing/types"

interface GasketPreviewSvgProps {
  polygon: PolygonWithHoles
  variant: "preview" | "thumbnail"
  labels?: string[]
  className?: string
}

export function GasketPreviewSvg({
  polygon,
  variant,
  labels,
  className,
}: GasketPreviewSvgProps) {
  const { viewBox, pathD, holeCenters } = useMemo(() => {
    const allPoints: { x: number; y: number }[] = []

    // Collect all points from outer loop and holes
    for (const loop of [polygon.outer, ...polygon.holes]) {
      for (const vertex of loop) {
        allPoints.push({ x: vertex.x, y: vertex.y })
      }
    }

    if (allPoints.length === 0) {
      return { viewBox: "0 0 100 100", pathD: "", holeCenters: [] }
    }

    let minX = allPoints[0].x
    let maxX = allPoints[0].x
    let minY = allPoints[0].y
    let maxY = allPoints[0].y

    for (const p of allPoints) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }

    const width = maxX - minX || 1
    const height = maxY - minY || 1
    const padding = Math.max(width, height) * 0.05

    const vbMinX = minX - padding
    const vbMinY = -maxY - padding
    const vbWidth = width + padding * 2
    const vbHeight = height + padding * 2

    const viewBox = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`

    // Build path with Y-flip
    const buildLoopPath = (loop: { x: number; y: number }[]): string => {
      if (loop.length === 0) return ""
      const first = loop[0]
      let d = `M${first.x},${-first.y}`
      for (let i = 1; i < loop.length; i++) {
        d += ` L${loop[i].x},${-loop[i].y}`
      }
      d += " Z"
      return d
    }

    const pathParts: string[] = []
    for (const loop of [polygon.outer, ...polygon.holes]) {
      pathParts.push(buildLoopPath(loop))
    }
    const pathD = pathParts.join(" ")

    // Compute hole centers for preview variant
    const centers: { x: number; y: number }[] = []
    if (variant === "preview" && polygon.holes.length > 0) {
      for (const hole of polygon.holes) {
        if (hole.length === 0) continue
        let sumX = 0
        let sumY = 0
        for (const v of hole) {
          sumX += v.x
          sumY += v.y
        }
        centers.push({ x: sumX / hole.length, y: sumY / hole.length })
      }
    }

    return { viewBox, pathD, holeCenters: centers }
  }, [polygon, variant])

  const strokeWidth = variant === "preview" ? 1.5 : 1.0
  const strokeColor = "hsl(var(--signal-orange))"
  const labelElements = useMemo(() => {
    if (variant !== "preview" || !labels || labels.length === 0) return null

    // Position labels below the polygon
    const allPoints: { x: number; y: number }[] = []
    for (const loop of [polygon.outer, ...polygon.holes]) {
      for (const vertex of loop) {
        allPoints.push({ x: vertex.x, y: vertex.y })
      }
    }

    if (allPoints.length === 0) return null

    let minX = allPoints[0].x
    let maxX = allPoints[0].x
    let minY = allPoints[0].y
    let maxY = allPoints[0].y

    for (const p of allPoints) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y)
      maxY = Math.max(maxY, p.y)
    }

    const centerX = (minX + maxX) / 2
    const labelStartY = -minY + (maxY - minY) * 0.1 + 12

    return labels.map((label, i) => (
      <text
        key={i}
        x={centerX}
        y={labelStartY + i * 12}
        fontFamily="monospace"
        fontSize="10"
        fill="hsl(var(--muted-foreground))"
        textAnchor="middle"
      >
        {label}
      </text>
    ))
  }, [variant, labels, polygon])

  const ariaLabel = labels && labels.length > 0 ? labels.join(", ") : "Gasket preview"

  return (
    <svg
      viewBox={viewBox}
      className={className}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        fillRule="evenodd"
      />
      {variant === "preview" &&
        holeCenters.map((center, i) => (
          <circle
            key={i}
            cx={center.x}
            cy={-center.y}
            r={strokeWidth * 2}
            fill={strokeColor}
          />
        ))}
      {labelElements}
    </svg>
  )
}
