// app/dashboard/cutting-engine/_components/gasket-canvas.tsx
"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"

import KonvaSheetRenderer from "./KonvaSheetRenderer"
import type { LayoutModel } from "./layout-model"
import { useWebGLAvailable } from "./use-webgl-available"

// Lazy-load the 3D renderer so three/R3F/drei split into their own
// chunk and only load when the operator has explicitly switched to
// 3D mode (and WebGL is available on a desktop viewport). The 2D
// KonvaSheetRenderer covers SSR + mobile + WebGL-fail + chunk-
// loading windows.
const ThreeSheetRenderer = dynamic(
  () => import("./three-sheet-renderer").then((m) => m.ThreeSheetRenderer),
  { ssr: false, loading: () => null }
)

const MOBILE_BREAKPOINT_PX = 768

export type GasketViewMode = "2d" | "3d"

interface GasketCanvasProps {
  layout: LayoutModel
  /** Stock thickness in inches — drives the gasket extrusion depth in 3D. */
  thicknessIn: number
  sheetWidthFallback?: number
  sheetLengthFallback?: number
  selectedPartId: string | null
  onPartClick?: (id: string) => void
  onSheetClick?: () => void
  /** Konva-only props — forwarded only when the 2D renderer runs. */
  onPartDragMove?: (id: string, x: number, y: number) => void
  onPartDragEnd?: (id: string, x: number, y: number) => void
  zoomPct: number
  showGrid: boolean
  sheetBase: "neutral" | "offcut"
  className?: string
  /**
   * Operator-controlled view mode. "2d" renders the Konva Free-roam
   * canvas (supports drag-to-move). "3d" renders the Three.js
   * inspection canvas (read-only). The parent owns this state so the
   * toolbar's 2D/3D toggle drives the renderer directly.
   *
   * Mobile + WebGL-unavailable viewports are forced to "2d" regardless
   * of the prop — touch-precision drag on small screens is essential,
   * and a missing WebGL context would render nothing in 3D mode.
   */
  viewMode: GasketViewMode
}

/**
 * Picks the right gasket-cutting renderer based on the operator's
 * explicit 2D/3D selection, with two safety overrides:
 *
 *  - Below the mobile breakpoint (768px) → Konva 2D regardless of
 *    `viewMode` (touch-precision drag + small-viewport 3D is unusable).
 *  - WebGL unavailable → Konva 2D (graceful degradation).
 *
 *  While WebGL detection is in flight (first render) or the 3D chunk
 *  is loading, Konva 2D renders so the operator never sees a blank
 *  canvas. The swap between modes is seamless — same `LayoutModel`,
 *  same selection state.
 */
export function GasketCanvas(props: GasketCanvasProps) {
  const webglAvailable = useWebGLAvailable()
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)

  useEffect(() => {
    // useEffect only runs on the client — no SSR guard needed.
    const query = window.matchMedia(`(min-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const update = () => setIsDesktop(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const canRender3D = webglAvailable === true && isDesktop === true
  const use3D = props.viewMode === "3d" && canRender3D

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
