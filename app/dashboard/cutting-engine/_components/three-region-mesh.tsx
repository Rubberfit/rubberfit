// app/dashboard/cutting-engine/_components/three-region-mesh.tsx
"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"

import type { LayoutRegion } from "./layout-model"

interface ThreeRegionMeshProps {
  region: LayoutRegion
  thicknessIn: number
  /**
   * Whether the region's bbox meets the Auto-nest reusable-offcut
   * thresholds (11.5×12 piece or 6×24 strip). The parent renderer
   * computes this via `isBboxReusable` so this component stays a
   * pure visual primitive.
   */
  isReusable: boolean
}

interface RegionMaterial {
  color: string
  opacity: number
  roughness: number
}

/**
 * Material lookup — locked by Kimi's `pr-c-gasket-rework-kimi-result.md`
 * design spec. `cutout` gets the orange family (#fb923c / #dc2626)
 * so operators immediately distinguish "this came from inside a
 * gasket" from edge trim (amber / red). `stock-remainder` is the
 * neutral PR-D placeholder.
 */
function pickMaterial(source: LayoutRegion["source"], isReusable: boolean): RegionMaterial {
  switch (source) {
    case "cutout":
      return isReusable
        ? { color: "#fb923c", opacity: 0.85, roughness: 0.5 }
        : { color: "#dc2626", opacity: 0.7, roughness: 0.7 }
    case "stock-remainder":
      return { color: "#475569", opacity: 0.4, roughness: 0.8 }
    case "trim":
    default:
      return isReusable
        ? { color: "#fbbf24", opacity: 0.85, roughness: 0.6 }
        : { color: "#ef4444", opacity: 0.75, roughness: 0.7 }
  }
}

export function ThreeRegionMesh({ region, thicknessIn, isReusable }: ThreeRegionMeshProps) {
  // Build THREE.Shape + ExtrudeGeometry + EdgesGeometry once per
  // region/thickness change. Imperative construction (not the JSX
  // intrinsic) is required so we can pass the same geometry to both
  // the fill mesh and the edges <lineSegments>; explicit dispose()
  // on unmount/change prevents the memory leak Codex flagged.
  const geometryPair = useMemo(() => {
    if (!region.polygon || region.polygon.length < 3) return null

    const shape = new THREE.Shape()
    shape.moveTo(region.polygon[0].x, region.polygon[0].y)
    for (let i = 1; i < region.polygon.length; i++) {
      shape.lineTo(region.polygon[i].x, region.polygon[i].y)
    }
    shape.closePath()

    if (region.holes) {
      for (const hole of region.holes) {
        if (hole.length < 3) continue
        const path = new THREE.Path()
        path.moveTo(hole[0].x, hole[0].y)
        for (let i = 1; i < hole.length; i++) {
          path.lineTo(hole[i].x, hole[i].y)
        }
        path.closePath()
        shape.holes.push(path)
      }
    }

    const extrude = new THREE.ExtrudeGeometry(shape, {
      depth: thicknessIn,
      steps: 1,
      bevelEnabled: false,
    })
    const edges = new THREE.EdgesGeometry(extrude)
    return { extrude, edges }
  }, [region, thicknessIn])

  useEffect(() => {
    return () => {
      if (geometryPair) {
        geometryPair.extrude.dispose()
        geometryPair.edges.dispose()
      }
    }
  }, [geometryPair])

  if (!geometryPair) return null

  const material = pickMaterial(region.source, isReusable)

  // Waste pieces sit at the same Y range as the placed gaskets
  // (Y=0 to Y=thickness — they ARE the leftover material, not labels
  // hovering above). That means R3F's raycaster hits them BEFORE
  // hitting a gasket if a waste piece sits between the camera and a
  // gasket — which silently broke the gasket drag interactions
  // (founder bug 2026-05-17). Set `raycast` to a no-op so the mesh
  // is purely visual and pointer events pass through to the gaskets
  // underneath. Same for the edges. Three's Object3D.raycast can be
  // any function with the (raycaster, intersects) signature; an
  // empty function makes the mesh invisible to event dispatch.
  return (
    <group rotation-x={-Math.PI / 2}>
      <mesh geometry={geometryPair.extrude} raycast={NO_RAYCAST}>
        <meshStandardMaterial
          transparent
          opacity={material.opacity}
          color={material.color}
          roughness={material.roughness}
          metalness={0}
        />
      </mesh>
      <lineSegments geometry={geometryPair.edges} renderOrder={2} raycast={NO_RAYCAST}>
        <lineBasicMaterial color="#1f2937" />
      </lineSegments>
    </group>
  )
}

const NO_RAYCAST: THREE.Object3D["raycast"] = () => {
  // Intentionally empty — see render-block comment above.
}
