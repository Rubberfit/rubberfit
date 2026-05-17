// app/dashboard/cutting-engine/_components/three-placed-part.tsx
"use client"

import { useMemo, useState } from "react"
import * as THREE from "three"
import { type ThreeEvent } from "@react-three/fiber"

import { polygonToShape } from "@/src/application/gasket/polygon-to-shape"

import type { PlacedPart } from "./layout-model"

interface ThreePlacedPartProps {
  part: PlacedPart
  thicknessIn: number
  isSelected: boolean
  onClick: () => void
}

/**
 * Read-only 3D rendering of a single placed gasket. Founder ruling
 * 2026-05-17: the previous drag-to-place interactions were unusable
 * (MapControls / native-event / raycaster interplay made every drag
 * feel like the camera was fighting the gasket). Dropped entirely.
 * The 3D canvas is now a pure inspection view — operators orbit /
 * zoom to verify the gasket geometry is what they expect; placement
 * happens by clicking queue cards (which add the gasket at the
 * canvas origin via the manual-layout pipeline).
 *
 * Click still selects so R-key rotate + Delete keep working through
 * `useManualPlacements`'s document-level keyboard handlers, but
 * pointer-down does NOT try to start a drag.
 */
export function ThreePlacedPart({
  part,
  thicknessIn,
  isSelected,
  onClick,
}: ThreePlacedPartProps): React.ReactElement {
  const [hovered, setHovered] = useState(false)

  const shape = useMemo(
    () =>
      polygonToShape({
        outer: part.polygon ?? [],
        holes: part.holes ?? [],
      }),
    [part.polygon, part.holes]
  )

  const extrudeSettings = useMemo(
    () => ({ depth: thicknessIn, steps: 1, bevelEnabled: false }),
    [thicknessIn]
  )

  return (
    <group
      position={[part.x, 0, part.y]}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <group rotation-x={-Math.PI / 2}>
        <mesh castShadow receiveShadow>
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshStandardMaterial
            color={isSelected ? "#fb923c" : "#ea580c"}
            roughness={0.7}
            metalness={0}
            emissive={isSelected || hovered ? "#ea580c" : "#000000"}
            emissiveIntensity={isSelected ? 0.3 : hovered ? 0.15 : 0}
          />
        </mesh>
      </group>
    </group>
  )
}
