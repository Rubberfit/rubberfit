// app/dashboard/cutting-engine/_components/gasket-preview-3d.tsx
"use client"

import { useMemo, useState } from "react"
import type * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { RotateCcw } from "lucide-react"

import type { PolygonWithHoles } from "@/src/application/packing/types"
import {
  polygonBbox,
  polygonToShape,
  type PolygonBbox,
} from "@/src/application/gasket/polygon-to-shape"

import { Button } from "@/app/components/ui/button"

import { GasketMesh } from "./gasket-preview-3d-mesh"

interface GasketPreview3DProps {
  polygon: PolygonWithHoles | null
  thicknessIn: number
  labels?: string[]
  className?: string
}

type Vec3 = [number, number, number]

interface SceneState {
  shape: THREE.Shape | null
  bbox: PolygonBbox | null
  cameraDistance: number
  cameraPosition: Vec3
}

export function GasketPreview3D({ polygon, thicknessIn, labels, className }: GasketPreview3DProps) {
  const [resetKey, setResetKey] = useState(0)

  const isEmpty = polygon === null || polygon.outer.length < 3

  const scene = useMemo<SceneState>(() => {
    if (isEmpty || polygon === null) {
      return {
        shape: null,
        bbox: null,
        cameraDistance: 4,
        cameraPosition: [2.77, 2.29, 2.77],
      }
    }

    const s = polygonToShape(polygon)
    const b = polygonBbox(polygon)
    const depth = Math.max(thicknessIn, 0.001)
    const dist = Math.max(b.width, b.height, depth) * 1.6

    const azimuth = (30 * Math.PI) / 180
    const elevation = (35 * Math.PI) / 180
    const r = dist
    const x = r * Math.cos(elevation) * Math.sin(azimuth)
    const y = r * Math.sin(elevation)
    const z = r * Math.cos(elevation) * Math.cos(azimuth)

    const cameraPosition: Vec3 = [x, y, z]
    return { shape: s, bbox: b, cameraDistance: dist, cameraPosition }
  }, [polygon, thicknessIn, isEmpty])

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const ariaLabel = labels?.length
    ? `3D gasket preview. ${labels.join(", ")}.`
    : "3D gasket preview. Drag to rotate, scroll to zoom."

  return (
    <div className={`relative ${className ?? ""}`}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{
          position: scene.cameraPosition,
          fov: 35,
          near: 0.01,
          far: scene.cameraDistance * 20,
        }}
        role="img"
        aria-label={ariaLabel}
      >
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.2}
          color="#fff5e6"
          castShadow
          shadow-bias={-0.001}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight position={[-4, 3, -2]} intensity={0.4} color="#e6f0ff" />

        {isEmpty || scene.shape === null || scene.bbox === null ? (
          <mesh>
            <cylinderGeometry args={[1, 1, 0.5, 32]} />
            <meshBasicMaterial color="#f97316" wireframe transparent opacity={0.15} />
          </mesh>
        ) : (
          <group position={[-scene.bbox.cx, -scene.bbox.cy, 0]}>
            <GasketMesh shape={scene.shape} depth={Math.max(thicknessIn, 0.001)} />
          </group>
        )}

        <OrbitControls
          key={resetKey}
          enablePan={false}
          enableDamping={!prefersReducedMotion}
          dampingFactor={0.05}
          minDistance={scene.cameraDistance * 0.3}
          maxDistance={scene.cameraDistance * 4}
        />
      </Canvas>

      <Button
        variant="outline"
        size="icon"
        className="absolute top-2 right-2"
        onClick={() => setResetKey((k) => k + 1)}
        aria-label="Reset 3D view"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-muted-foreground text-sm">Enter dimensions to preview</span>
        </div>
      )}

      {labels && labels.length > 0 && (
        <div className="mt-2 text-center">
          {labels.map((label) => (
            <div key={label} className="text-muted-foreground font-mono text-xs leading-relaxed">
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
