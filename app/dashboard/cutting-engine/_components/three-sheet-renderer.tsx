// app/dashboard/cutting-engine/_components/three-sheet-renderer.tsx
"use client"

import { useCallback, useMemo, useRef } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { MapControls } from "@react-three/drei"
import type { MapControls as MapControlsImpl } from "three-stdlib"

import type { LayoutModel } from "./layout-model"
import { isBboxReusable } from "./manual-layout/regions"
import { ThreePlacedPart } from "./three-placed-part"
import { ThreeRegionMesh } from "./three-region-mesh"

interface ThreeSheetRendererProps {
  layout: LayoutModel | null
  /** Stock thickness in inches — drives the extrusion depth on every placed gasket. */
  thicknessIn: number
  /** Stock sheet width fallback when `layout` is null (empty state). */
  sheetWidthFallback?: number
  /** Stock sheet length fallback when `layout` is null (empty state). */
  sheetLengthFallback?: number
  selectedPartId: string | null
  onPartClick?: (id: string) => void
  onSheetClick?: () => void
  /** Continuous drag callback (pointer-move rate) — mirrors KonvaSheetRenderer. */
  onPartDragMove?: (id: string, x: number, y: number) => void
  /** Drop-commit callback — fires on pointer-up with the snapped position. */
  onPartDragEnd?: (id: string, x: number, y: number) => void
  zoomPct: number
  showGrid: boolean
  /** Visual semantics for the stock background — matches KonvaSheetRenderer's prop. */
  sheetBase: "neutral" | "offcut"
  className?: string
}

/**
 * Camera distance via fov-based snug fit:
 *   D = (largestExtent / 2) / tan(fov/2) × margin
 *
 * This guarantees the stock fits the vertical viewport with the
 * requested margin (default 1.1), instead of overshooting like a
 * fixed `longest × multiplier` would in a wide-but-short canvas.
 * The `largestExtent` used is `max(width, length)` so a square 96×48
 * sheet frames around its long edge rather than its short one — the
 * viewport's own aspect ratio handles the width fit naturally.
 */
function computeCameraPosition(
  width: number,
  length: number,
  azimuthDeg: number,
  elevationDeg: number,
  fovDeg: number,
  margin: number
): [number, number, number] {
  const largestExtent = Math.max(width, length)
  const halfFovRad = ((fovDeg / 2) * Math.PI) / 180
  const distance = (largestExtent / 2 / Math.tan(halfFovRad)) * margin
  const azimuthRad = (azimuthDeg * Math.PI) / 180
  const elevationRad = (elevationDeg * Math.PI) / 180

  const cx = width / 2
  const cz = length / 2

  const x = cx + distance * Math.cos(elevationRad) * Math.sin(azimuthRad)
  const y = distance * Math.sin(elevationRad)
  const z = cz + distance * Math.cos(elevationRad) * Math.cos(azimuthRad)

  return [x, y, z]
}

export function ThreeSheetRenderer({
  layout,
  thicknessIn,
  sheetWidthFallback = 96,
  sheetLengthFallback = 48,
  selectedPartId,
  onPartClick,
  onSheetClick,
  onPartDragMove,
  onPartDragEnd,
  zoomPct: _zoomPct,
  showGrid,
  sheetBase: _sheetBase,
  className,
}: ThreeSheetRendererProps): React.ReactElement {
  const sheetWidth = layout?.sheetWidth ?? sheetWidthFallback
  const sheetLength = layout?.sheetLength ?? sheetLengthFallback
  const thickness = thicknessIn

  // MapControls disabled during a mesh drag — otherwise left-click
  // pans the camera at the same time the mesh drag runs and the
  // whole scene appears to move together (founder bug 2026-05-17).
  const controlsRef = useRef<MapControlsImpl | null>(null)
  const handleDragStateChange = useCallback((dragging: boolean) => {
    const controls = controlsRef.current
    if (!controls) return
    controls.enabled = !dragging
  }, [])

  const longest = Math.max(sheetWidth, sheetLength)

  const cameraPosition = useMemo(
    () => computeCameraPosition(sheetWidth, sheetLength, 45, 35, 35, 1.1),
    [sheetWidth, sheetLength]
  )

  const gridDivisions = useMemo(() => {
    return Math.ceil(longest / 12) * 2
  }, [longest])

  const stockCenter: [number, number, number] = [sheetWidth / 2, -0.025, sheetLength / 2]
  const controlsTarget: [number, number, number] = [sheetWidth / 2, 0, sheetLength / 2]

  const keyLightPosition: [number, number, number] = useMemo(() => {
    const offset = longest * 0.6
    return [sheetWidth / 2 - offset, longest * 0.5, sheetLength / 2 - offset]
  }, [sheetWidth, sheetLength, longest])

  const fillLightPosition: [number, number, number] = useMemo(() => {
    const offset = longest * 0.4
    return [sheetWidth / 2 + offset, longest * 0.3, sheetLength / 2 + offset]
  }, [sheetWidth, sheetLength, longest])

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{
          position: cameraPosition,
          fov: 35,
          near: 0.01,
          far: longest * 20,
        }}
        role="img"
        aria-label="3D gasket cutting workspace. Drag to pan, scroll to zoom, click parts to select."
      >
        <color attach="background" args={["#0f172a"]} />

        <ambientLight intensity={0.3} />

        <directionalLight
          position={keyLightPosition}
          intensity={1.2}
          color="#fff5e6"
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-bias={-0.001}
        />

        <directionalLight position={fillLightPosition} intensity={0.4} color="#e6f0ff" />

        <MapControls
          ref={controlsRef}
          target={controlsTarget}
          enablePan
          enableZoom
          enableRotate
          minPolarAngle={Math.PI / 12}
          maxPolarAngle={Math.PI / 3}
          dampingFactor={0.05}
        />

        <group onClick={onSheetClick}>
          <mesh position={stockCenter} receiveShadow>
            <boxGeometry args={[sheetWidth, 0.05, sheetLength]} />
            <meshStandardMaterial color="#334155" roughness={0.7} metalness={0} />
          </mesh>
        </group>

        {showGrid && (
          <gridHelper
            args={[longest, gridDivisions, "#475569", "#334155"]}
            position={[sheetWidth / 2, 0.01, sheetLength / 2]}
            rotation-x={0}
          />
        )}

        {layout?.parts.map((part) => (
          <ThreePlacedPart
            key={part.id}
            part={part}
            thicknessIn={thickness}
            isSelected={selectedPartId === part.id}
            onClick={() => onPartClick?.(part.id)}
            onDragMove={onPartDragMove}
            onDragEnd={onPartDragEnd}
            onDragStateChange={handleDragStateChange}
          />
        ))}

        {/* Waste / cutout pieces extruded at stock thickness (PR-C
            rework). Replaces the bbox planeGeometry rectangles —
            now each waste region renders as its actual polygon
            shape so the operator sees a real 3D leftover/cutout
            piece, not a flat label hovering over the sheet. Regions
            without a `polygon` field skip render (legacy bbox-only
            entries from auto-nest weren't classified by Clipper). */}
        {layout?.offcuts.map((region, i) =>
          region.polygon ? (
            <ThreeRegionMesh
              key={`offcut-${i}`}
              region={region}
              thicknessIn={thickness}
              isReusable={isBboxReusable(region.width, region.height)}
            />
          ) : null
        )}

        {layout?.scrap.map((region, i) =>
          region.polygon ? (
            <ThreeRegionMesh
              key={`scrap-${i}`}
              region={region}
              thicknessIn={thickness}
              isReusable={false}
            />
          ) : null
        )}
      </Canvas>
    </div>
  )
}
