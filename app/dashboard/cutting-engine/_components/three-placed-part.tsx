// app/dashboard/cutting-engine/_components/three-placed-part.tsx
"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { type ThreeEvent, useThree } from "@react-three/fiber"

import { polygonToShape } from "@/src/application/gasket/polygon-to-shape"

import type { PlacedPart } from "./layout-model"

interface ThreePlacedPartProps {
  part: PlacedPart
  thicknessIn: number
  isSelected: boolean
  onClick: () => void
  /**
   * Continuous drag callback (pointer-move rate). Mirrors the
   * KonvaSheetRenderer onPartDragMove contract — the host uses it
   * for adaptive offcut/waste recomputation via useDragSnapshot's
   * rAF-throttling, so emitting on every pointer-move is fine.
   */
  onDragMove?: (id: string, x: number, y: number) => void
  /** Fires on pointer-up with the snapped destination. */
  onDragEnd?: (id: string, x: number, y: number) => void
  /**
   * Notifies the parent renderer when a drag starts / ends so it can
   * disable MapControls — otherwise left-click pans the camera at
   * the same time the mesh drag runs, and both move together
   * (founder bug 2026-05-17 — "sheet moves too").
   */
  onDragStateChange?: (dragging: boolean) => void
  /** Snap step in inches (12 for the standard grid). */
  snapInches?: number
}

// Drag plane: horizontal plane at Y=0 (the stock's top face). The
// raycaster intersects this to convert pointer events into world
// coords, which are then mapped to 2D layout coords (X stays X,
// world Z becomes layout Y).
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

/**
 * R3F replaces `e.target` at runtime with a plain object exposing
 * `setPointerCapture` / `releasePointerCapture` (see
 * @react-three/fiber events.cjs.dev.js:793 — the runtime shape is
 * `{ hasPointerCapture, setPointerCapture, releasePointerCapture }`).
 * The TS declarations type `e.target` as the native DOM `EventTarget`
 * which doesn't expose those methods, and an `instanceof Element`
 * check silently fails (the runtime object is a plain object, not a
 * DOM Element). This structural guard narrows to the R3F shape
 * without an `as` cast, so the pointer-capture call lands on the
 * mesh-aware wrapper that keeps routing pointer-move events to the
 * dragged mesh even when the ray leaves it.
 */
interface PointerCaptureCapable {
  setPointerCapture(pointerId: number): void
  releasePointerCapture(pointerId: number): void
}

function hasPointerCaptureMethods(value: unknown): value is PointerCaptureCapable {
  if (typeof value !== "object" || value === null) return false
  const candidate = value as { setPointerCapture?: unknown; releasePointerCapture?: unknown }
  return (
    typeof candidate.setPointerCapture === "function" &&
    typeof candidate.releasePointerCapture === "function"
  )
}

export function ThreePlacedPart({
  part,
  thicknessIn,
  isSelected,
  onClick,
  onDragMove,
  onDragEnd,
  onDragStateChange,
  snapInches = 12,
}: ThreePlacedPartProps): React.ReactElement {
  const groupRef = useRef<THREE.Group>(null)
  const grabOffsetRef = useRef<{ dx: number; dy: number } | null>(null)
  const lastEmittedRef = useRef<{ x: number; y: number } | null>(null)
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { invalidate, gl } = useThree()

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

  const snap = useCallback((v: number) => Math.round(v / snapInches) * snapInches, [snapInches])

  // Raycaster against the Y=0 plane → world (x, z) → 2D layout coords.
  const planeIntersect = useCallback(
    (e: ThreeEvent<PointerEvent>): { x: number; y: number } | null => {
      const point = new THREE.Vector3()
      const hit = e.ray.intersectPlane(DRAG_PLANE, point)
      if (!hit) return null
      return { x: point.x, y: point.z }
    },
    []
  )

  const updateCursor = useCallback(
    (nextHovered: boolean, nextDragging: boolean) => {
      if (nextDragging) gl.domElement.style.cursor = "grabbing"
      else if (nextHovered) gl.domElement.style.cursor = "grab"
      else gl.domElement.style.cursor = ""
    },
    [gl]
  )

  const handlePointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      // R3F's stopPropagation only stops R3F's own event dispatch — it
      // does NOT prevent MapControls / OrbitControls from receiving
      // the native DOM PointerEvent on the canvas. Stop the native
      // event too, otherwise MapControls starts a pan in parallel
      // with the mesh drag and the whole scene moves with the cursor
      // (founder bug 2026-05-17 "completely broken / can't go to the
      // center"). nativeEvent is the underlying DOM PointerEvent.
      e.nativeEvent.stopPropagation()
      e.nativeEvent.preventDefault()
      onClick() // promote to selected on any pointer-down (click or drag-start)
      if (!onDragMove && !onDragEnd) return
      const layoutPoint = planeIntersect(e)
      if (!layoutPoint) return
      grabOffsetRef.current = {
        dx: layoutPoint.x - part.x,
        dy: layoutPoint.y - part.y,
      }
      lastEmittedRef.current = { x: part.x, y: part.y }
      setDragging(true)
      onDragStateChange?.(true)
      updateCursor(true, true)
      // Engage R3F's mesh-aware pointer capture — see the
      // hasPointerCaptureMethods note above. Without this, R3F's
      // raycaster sees the cursor leave the dragged gasket and starts
      // dispatching onPointerMove to neighboring meshes instead.
      if (hasPointerCaptureMethods(e.target)) {
        try {
          e.target.setPointerCapture(e.pointerId)
        } catch {
          // Some touch contexts reject capture; drag still works
          // while the ray stays on the gasket.
        }
      }
    },
    [
      onClick,
      onDragEnd,
      onDragMove,
      onDragStateChange,
      part.x,
      part.y,
      planeIntersect,
      updateCursor,
    ]
  )

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragging || !grabOffsetRef.current) return
      // Same as handlePointerDown — block the native event so
      // MapControls doesn't get pan deltas during a mesh drag.
      e.nativeEvent.stopPropagation()
      e.nativeEvent.preventDefault()
      const layoutPoint = planeIntersect(e)
      if (!layoutPoint) return
      const targetX = snap(layoutPoint.x - grabOffsetRef.current.dx)
      const targetY = snap(layoutPoint.y - grabOffsetRef.current.dy)
      const last = lastEmittedRef.current
      if (last && last.x === targetX && last.y === targetY) return
      lastEmittedRef.current = { x: targetX, y: targetY }
      // Imperative position update so we don't wait on React re-render.
      // invalidate() triggers a single re-paint since frameloop="demand".
      if (groupRef.current) {
        groupRef.current.position.x = targetX
        groupRef.current.position.z = targetY
        invalidate()
      }
      onDragMove?.(part.id, targetX, targetY)
    },
    [dragging, invalidate, onDragMove, part.id, planeIntersect, snap]
  )

  const handlePointerUp = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!dragging) return
      e.nativeEvent.stopPropagation()
      setDragging(false)
      onDragStateChange?.(false)
      grabOffsetRef.current = null
      if (hasPointerCaptureMethods(e.target)) {
        try {
          e.target.releasePointerCapture(e.pointerId)
        } catch {
          // Pointer capture may not have been claimed; safe to skip.
        }
      }
      const last = lastEmittedRef.current
      if (last) onDragEnd?.(part.id, last.x, last.y)
      lastEmittedRef.current = null
      updateCursor(hovered, false)
    },
    [dragging, hovered, onDragEnd, onDragStateChange, part.id, updateCursor]
  )

  return (
    <group
      ref={groupRef}
      position={[part.x, 0, part.y]}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        updateCursor(true, dragging)
      }}
      onPointerOut={() => {
        setHovered(false)
        updateCursor(false, dragging)
      }}
    >
      <group rotation-x={-Math.PI / 2}>
        <mesh castShadow receiveShadow>
          <extrudeGeometry args={[shape, extrudeSettings]} />
          <meshStandardMaterial
            color={isSelected ? "#fb923c" : "#ea580c"}
            roughness={0.7}
            metalness={0}
            emissive={isSelected || hovered || dragging ? "#ea580c" : "#000000"}
            emissiveIntensity={dragging ? 0.4 : isSelected ? 0.3 : hovered ? 0.15 : 0}
          />
        </mesh>
      </group>
    </group>
  )
}
