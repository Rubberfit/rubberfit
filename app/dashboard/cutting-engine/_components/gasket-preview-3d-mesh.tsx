// app/dashboard/cutting-engine/_components/gasket-preview-3d-mesh.tsx
import { useMemo } from "react"
import type * as THREE from "three"

interface GasketMeshProps {
  shape: THREE.Shape
  depth: number
}

export function GasketMesh({ shape, depth }: GasketMeshProps) {
  const extrudeSettings = useMemo(
    () => ({
      depth,
      steps: 1,
      bevelEnabled: false,
    }),
    [depth]
  )

  return (
    <>
      <mesh castShadow receiveShadow>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshStandardMaterial color="#f97316" roughness={0.7} metalness={0} />
      </mesh>
      <mesh renderOrder={1}>
        <extrudeGeometry args={[shape, extrudeSettings]} />
        <meshBasicMaterial
          color="#c2410c"
          wireframe
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
