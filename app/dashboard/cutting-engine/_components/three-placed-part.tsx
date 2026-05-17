// app/dashboard/cutting-engine/_components/three-placed-part.tsx
"use client"

import { useMemo } from "react"
import * as THREE from "three"

import { polygonToShape } from "@/src/application/gasket/polygon-to-shape"
import type { PlacedPart } from "./layout-model"

interface ThreePlacedPartProps {
  part: PlacedPart
  thicknessIn: number
  isSelected: boolean
  onClick: () => void
}

export function ThreePlacedPart({
  part,
  thicknessIn,
  isSelected,
  onClick,
}: ThreePlacedPartProps): React.ReactElement {
  const shape = useMemo(() => {
    return polygonToShape({
      outer: part.polygon ?? [],
      holes: part.holes ?? [],
    })
  }, [part.polygon, part.holes])

  const extrudeSettings = useMemo(
    () => ({ depth: thicknessIn, steps: 1, bevelEnabled: false }),
    [thicknessIn]
  )

  return (
    <group
      rotation-x={-Math.PI / 2}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial
          color="#ea580c"
          roughness={0.7}
          metalness={0}
          emissive={isSelected ? "#ea580c" : "#000000"}
          emissiveIntensity={isSelected ? 0.2 : 0}
        />
      </mesh>
      {isSelected && (
        <mesh scale={[1.02, 1.02, 1.02]}>
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} side={THREE.FrontSide} />
        </mesh>
      )}
    </group>
  )
}
