// app/dashboard/cutting-engine/_components/three-placed-part.tsx
"use client"

import { useMemo, useState } from "react"
import { type ThreeEvent } from "@react-three/fiber"
import { Edges } from "@react-three/drei"

import { polygonToShape } from "@/src/application/gasket/polygon-to-shape"

import type { PlacedPart } from "./layout-model"

interface ThreePlacedPartProps {
  part: PlacedPart
  thicknessIn: number
  isSelected: boolean
  onClick: () => void
}

/**
 * Read-only 3D rendering of a single placed gasket — FreeCAD-style
 * inspection (founder ruling 2026-05-17). Click selects so R-key
 * rotate + Delete keep working through `useManualPlacements`'s
 * document-level keyboard handlers, but pointer-down does NOT start
 * a drag — the 3D canvas is a pure spinner; production placement
 * happens in the 2D Konva renderer.
 *
 * Visual language: signal-orange brand body, `<Edges>` for the
 * FreeCAD flat-lines outline, subtle hover / selected emissive lift
 * for affordance.
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

  const bodyColor = isSelected ? "#ff7a4a" : hovered ? "#f06a3a" : "#ee5a24"
  const edgeColor = isSelected || hovered ? "#ff9f7a" : "#111827"
  const emissiveColor = isSelected ? "#ff7a4a" : hovered ? "#f06a3a" : "#000000"
  const emissiveIntensity = isSelected ? 0.3 : hovered ? 0.15 : 0

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
        <mesh>
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshStandardMaterial
            color={bodyColor}
            roughness={0.7}
            metalness={0}
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
          />
          <Edges threshold={15} color={edgeColor} />
        </mesh>
      </group>
    </group>
  )
}
