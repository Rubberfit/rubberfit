// app/dashboard/cutting-engine/_components/three-sheet-renderer.tsx
"use client"

import { useMemo } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { MapControls } from "@react-three/drei"

import type { LayoutModel } from "./layout-model"
import { ThreePlacedPart } from "./three-placed-part"

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
  zoomPct: number
  showGrid: boolean
  /** Visual semantics for the stock background — matches KonvaSheetRenderer's prop. */
  sheetBase: "neutral" | "offcut"
  className?: string
}

function computeCameraPosition(
  width: number,
  length: number,
  azimuthDeg: number,
  elevationDeg: number,
  distanceMultiplier: number
): [number, number, number] {
  const longest = Math.max(width, length)
  const distance = longest * distanceMultiplier
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
  zoomPct: _zoomPct,
  showGrid,
  sheetBase: _sheetBase,
  className,
}: ThreeSheetRendererProps): React.ReactElement {
  const sheetWidth = layout?.sheetWidth ?? sheetWidthFallback
  const sheetLength = layout?.sheetLength ?? sheetLengthFallback
  const thickness = thicknessIn

  const longest = Math.max(sheetWidth, sheetLength)

  const cameraPosition = useMemo(
    () => computeCameraPosition(sheetWidth, sheetLength, 45, 35, 1.15),
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
          <group key={part.id} position={[part.x, 0, part.y]}>
            <ThreePlacedPart
              part={part}
              thicknessIn={thickness}
              isSelected={selectedPartId === part.id}
              onClick={() => onPartClick?.(part.id)}
            />
          </group>
        ))}

        {layout?.offcuts.map((offcut, i) => (
          <mesh
            key={`offcut-${i}`}
            position={[offcut.x + offcut.width / 2, 0.001, offcut.y + offcut.height / 2]}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[offcut.width, offcut.height]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        ))}

        {layout?.scrap.map((scrap, i) => (
          <mesh
            key={`scrap-${i}`}
            position={[scrap.x + scrap.width / 2, 0.001, scrap.y + scrap.height / 2]}
            rotation-x={-Math.PI / 2}
          >
            <planeGeometry args={[scrap.width, scrap.height]} />
            <meshBasicMaterial color="#ef4444" transparent opacity={0.25} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </Canvas>
    </div>
  )
}
