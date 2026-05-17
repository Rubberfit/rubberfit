// app/dashboard/cutting-engine/_components/gasket-canvas.tsx
"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import KonvaSheetRenderer from "./KonvaSheetRenderer"
import type { LayoutModel } from "./layout-model"
import { useWebGLAvailable } from "./use-webgl-available"

// Lazy-load the 3D renderer so three/R3F/drei split into their own
// chunk and only load when (a) WebGL is available and (b) viewport is
// desktop. The 2D KonvaSheetRenderer covers SSR + mobile + WebGL-fail
// + chunk-loading windows — Codex finding #5 (next/dynamic loading
// component doesn't receive props, so we render Konva imperatively
// from a wrapper instead).
const ThreeSheetRenderer = dynamic(
  () => import("./three-sheet-renderer").then((m) => m.ThreeSheetRenderer),
  { ssr: false, loading: () => null }
)

const MOBILE_BREAKPOINT_PX = 768

interface GasketCanvasProps {
  layout: LayoutModel
  /** Stock thickness in inches — drives the gasket extrusion depth in 3D. */
  thicknessIn: number
  sheetWidthFallback?: number
  sheetLengthFallback?: number
  selectedPartId: string | null
  onPartClick?: (id: string) => void
  onSheetClick?: () => void
  /** Konva-only props — forwarded only when the 2D fallback renders. */
  onPartDragMove?: (id: string, x: number, y: number) => void
  onPartDragEnd?: (id: string, x: number, y: number) => void
  zoomPct: number
  showGrid: boolean
  sheetBase: "neutral" | "offcut"
  className?: string
}

/**
 * Picks the right gasket-cutting renderer based on viewport size +
 * WebGL availability:
 *
 *  - Below the mobile breakpoint (768px) → Konva 2D (touch precision +
 *    small-viewport 3D is unusable per Kimi UX spec).
 *  - WebGL unavailable → Konva 2D (graceful degradation).
 *  - Otherwise → Three.js 3D (lazy-loaded).
 *
 *  While the WebGL detection is in flight (first render) OR while the
 *  3D chunk is loading, Konva 2D renders so the operator never sees a
 *  blank canvas. The swap to 3D is seamless — same `LayoutModel`,
 *  same selection state.
 */
export function GasketCanvas(props: GasketCanvasProps) {
  const webglAvailable = useWebGLAvailable()
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsDesktop(false)
      return
    }
    const query = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const use3D = webglAvailable === true && isDesktop === true

  if (use3D) {
    return (
      <ThreeSheetRenderer
        layout={props.layout}
        thicknessIn={props.thicknessIn}
        sheetWidthFallback={props.sheetWidthFallback}
        sheetLengthFallback={props.sheetLengthFallback}
        selectedPartId={props.selectedPartId}
        onPartClick={props.onPartClick}
        onSheetClick={props.onSheetClick}
        onPartDragMove={props.onPartDragMove}
        onPartDragEnd={props.onPartDragEnd}
        zoomPct={props.zoomPct}
        showGrid={props.showGrid}
        sheetBase={props.sheetBase}
        className={props.className}
      />
    )
  }

  return (
    <KonvaSheetRenderer
      layout={props.layout}
      selectedPartId={props.selectedPartId}
      onPartClick={props.onPartClick}
      onSheetClick={props.onSheetClick}
      onPartDragMove={props.onPartDragMove}
      onPartDragEnd={props.onPartDragEnd}
      sheetBase={props.sheetBase}
      zoomPct={props.zoomPct}
      showGrid={props.showGrid}
    />
  )
}
