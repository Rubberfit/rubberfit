// app/dashboard/cutting-engine/_components/three-sheet-renderer.tsx
"use client"

import { useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { ContactShadows, GizmoHelper, GizmoViewport, OrbitControls } from "@react-three/drei"

import type { LayoutModel } from "./layout-model"
import { ThreePlacedPart } from "./three-placed-part"

interface ThreeSheetRendererProps {
  layout: LayoutModel | null
  /** Stock thickness in inches — drives the extrusion depth on every placed gasket. */
  thicknessIn: number
  /** Stock sheet width fallback. Retained on the prop list for caller
   *  compatibility — the FreeCAD-style inspector no longer renders a
   *  stock sheet, so this is ignored. */
  sheetWidthFallback?: number
  /** Same as above — retained but ignored. */
  sheetLengthFallback?: number
  selectedPartId: string | null
  onPartClick?: (id: string) => void
  onSheetClick?: () => void
  /** Toolbar zoom — retained for prop compatibility; orthographic
   *  bbox-fit owns the actual camera zoom in 3D. */
  zoomPct: number
  /** Toolbar grid toggle — retained for prop compatibility; the
   *  FreeCAD Part workbench doesn't render a grid, so this is ignored. */
  showGrid: boolean
  /** Visual semantics for the stock background — matches KonvaSheetRenderer's prop. */
  sheetBase: "neutral" | "offcut"
  className?: string
}

function computePartBbox(parts: LayoutModel["parts"]) {
  if (parts.length === 0) {
    return {
      center: [0, 0, 0] as [number, number, number],
      extent: 12,
    }
  }

  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity

  for (const part of parts) {
    const x = part.x
    const z = part.y
    // PlacedPart's bbox is `width` × `height` (height is the
    // along-length axis in sheet space — same naming as Konva).
    const hw = part.width / 2
    const hh = part.height / 2

    minX = Math.min(minX, x - hw)
    minZ = Math.min(minZ, z - hh)
    maxX = Math.max(maxX, x + hw)
    maxZ = Math.max(maxZ, z + hh)
  }

  const width = maxX - minX
  const length = maxZ - minZ
  const extent = Math.max(width, length)

  return {
    center: [(minX + maxX) / 2, 0, (minZ + maxZ) / 2] as [number, number, number],
    extent: extent > 0 ? extent : 12,
  }
}

function computeIsometricPosition(
  center: [number, number, number],
  extent: number
): [number, number, number] {
  const distance = extent * 0.85
  const azimuthRad = (45 * Math.PI) / 180
  const elevationRad = (35 * Math.PI) / 180

  const x = center[0] + distance * Math.cos(elevationRad) * Math.sin(azimuthRad)
  const y = distance * Math.sin(elevationRad)
  const z = center[2] + distance * Math.cos(elevationRad) * Math.cos(azimuthRad)

  return [x, y, z]
}

/**
 * FreeCAD-style 3D part inspector. Founder ruling 2026-05-17: "no need
 * for this background. the 2d will be like free roam where the waste
 * and reusable etc. but all gasket stuff will be in 2d, like free
 * roam, think of the 3d one as freecad where itll just be a spinner
 * for visualizing the parts."
 *
 * The scene is intentionally minimal — light CAD viewport, placed
 * gasket(s) as the hero, contact shadow for depth, axis triad for
 * orientation, orbit controls for inspection. The 2D Konva renderer
 * owns the production canvas (sheet + waste + scrap + reusable).
 */
export function ThreeSheetRenderer({
  layout,
  thicknessIn,
  selectedPartId,
  onPartClick,
  className,
}: ThreeSheetRendererProps): React.ReactElement {
  // Memoise the array reference so the bbox useMemo below has a
  // stable dependency — `layout?.parts ?? []` would otherwise be a
  // fresh empty array on every render when `layout` is null.
  const parts = useMemo(() => layout?.parts ?? [], [layout?.parts])
  const thickness = thicknessIn

  const { partCenter, partExtent } = useMemo(() => {
    const { center, extent } = computePartBbox(parts)
    return { partCenter: center, partExtent: extent }
  }, [parts])

  const isometricPos = useMemo(
    () => computeIsometricPosition(partCenter, partExtent),
    [partCenter, partExtent]
  )

  // Base zoom (400) is calibrated so a single 12″ gasket frames with
  // ~15 % viewport margin at a typical canvas aspect; scaling by
  // (baseZoom / extent) makes the fit invariant under part size, and
  // the 0.85 margin keeps the gasket off the viewport edges.
  const fitZoom = useMemo(() => {
    const baseZoom = 400
    return (baseZoom / partExtent) * 0.85
  }, [partExtent])

  const hasParts = parts.length > 0

  return (
    <div className={className} style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        orthographic
        camera={{ position: isometricPos, zoom: fitZoom, near: 0.1, far: 10000 }}
        gl={{ antialias: true }}
        shadows={false}
        dpr={[1, 2]}
        role="img"
        aria-label="3D gasket inspector. Drag to orbit, scroll to zoom, click parts to select."
      >
        <color attach="background" args={["#f8fafc"]} />

        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 8, 5]} intensity={0.75} />
        <directionalLight position={[-5, 3, -4]} intensity={0.25} />

        {hasParts && (
          <ContactShadows
            position={[partCenter[0], -0.01, partCenter[2]]}
            opacity={0.12}
            blur={2}
            scale={partExtent * 3}
          />
        )}

        <OrbitControls target={partCenter} enableDamping enablePan={false} />

        <GizmoHelper alignment="bottom-right" margin={[56, 56]}>
          <GizmoViewport />
        </GizmoHelper>

        {parts.map((part) => (
          <ThreePlacedPart
            key={part.id}
            part={part}
            thicknessIn={thickness}
            isSelected={selectedPartId === part.id}
            onClick={() => onPartClick?.(part.id)}
          />
        ))}
      </Canvas>

      {!hasParts && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Place a gasket to inspect in 3D</div>
        </div>
      )}
    </div>
  )
}
