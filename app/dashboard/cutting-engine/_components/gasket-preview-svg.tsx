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

export function GasketPreviewSvg({ polygon, variant, labels, className }: GasketPreviewSvgProps) {
  const { viewBox, pathD, holeCenters, scale } = useMemo(() => {
    const allPoints: { x: number; y: number }[] = []

    // Collect all points from outer loop and holes
    for (const loop of [polygon.outer, ...polygon.holes]) {
      for (const vertex of loop) {
        allPoints.push({ x: vertex.x, y: vertex.y })
      }
    }

    if (allPoints.length === 0) {
      return {
        viewBox: "0 0 100 100",
        pathD: "",
        holeCenters: [] as { x: number; y: number }[],
        scale: 1,
      }
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
    // Reserve extra bottom padding for the label stack when present
    // (Sigilix HIGH 1 fix — labels were rendering outside the viewBox
    // before because the spacing/fontSize/offset were inch-unit
    // hardcoded constants in an inch-scale coord system).
    const labelLines = variant === "preview" && labels ? labels.length : 0
    const padding = Math.max(width, height) * 0.05
    // viewBox scale unit — every label/dot dimension is keyed to this
    // so they render at a sensible relative size whether the gasket is
    // 0.5″ or 100″ across.
    const localScale = Math.max(width, height)
    const labelFont = localScale * 0.05
    const labelLineHeight = labelFont * 1.4
    const labelBlockHeight = labelLines > 0 ? labelLines * labelLineHeight + padding : 0

    const vbMinX = minX - padding
    const vbMinY = -maxY - padding
    const vbWidth = width + padding * 2
    const vbHeight = height + padding * 2 + labelBlockHeight

    const viewBox = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`

    // Build path with Y-flip (math-up → SVG-down)
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

    return { viewBox, pathD, holeCenters: centers, scale: localScale }
  }, [polygon, variant, labels])

  // Scale-aware dimensions: bolt-hole dots ≈ 1% of viewBox extent so
  // they stay legible without obscuring the polygon (Sigilix HIGH 2 fix).
  // `vector-effect="non-scaling-stroke"` keeps the path stroke pixel-
  // sized; dot radius is in viewBox coords so it scales with zoom.
  const boltDotRadius = scale * 0.012
  const labelFontSize = scale * 0.05
  const labelLineHeight = labelFontSize * 1.4
  const strokeWidth = variant === "preview" ? 1.5 : 1.0
  // Brand signal-orange — `--signal-orange` was never actually defined
  // in app/globals.css (only comments reference it). The accent ramp
  // uses raw #ee5a24 hex throughout. Hard-coding the hex here so
  // thumbnails actually render an orange stroke instead of an empty
  // gray box (founder bug 2026-05-17).
  const strokeColor = "#ee5a24"

  const labelElements = useMemo(() => {
    if (variant !== "preview" || !labels || labels.length === 0) return null

    // Position labels below the polygon, just under the bbox bottom.
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
    const labelStartY = -minY + labelLineHeight

    return labels.map((label, i) => (
      <text
        key={i}
        x={centerX}
        y={labelStartY + i * labelLineHeight}
        fontFamily="monospace"
        fontSize={labelFontSize}
        fill="#71717a"
        textAnchor="middle"
      >
        {label}
      </text>
    ))
  }, [variant, labels, polygon, labelFontSize, labelLineHeight])

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
      />
      {variant === "preview" &&
        holeCenters.map((center, i) => (
          <circle key={i} cx={center.x} cy={-center.y} r={boltDotRadius} fill={strokeColor} />
        ))}
      {labelElements}
    </svg>
  )
}
