// SVG `<path>` d-attribute → closed loops.
//
// Split out of `parse-svg.ts` so the parser stays under the per-file
// line budget. The state machine is fed segments by `svgpath`'s
// `.iterate(fn)`, normalised to absolute commands via
// `.unarc().unshort().abs()` before iteration. Y-flip is applied
// upstream so all coordinates are already in math-coords (Y up).
//
// Only closed subpaths (explicit `Z`) emit loops — open subpaths are
// dropped to avoid the silent force-close phantom-polygon trap.

import svgpath from "svgpath"

import {
  tessellateBezier,
  tessellateQuadratic,
  type CubicBezier,
  type QuadraticBezier,
} from "./tessellate-curves"
import type { Point2D } from "./svg-types"

const ENDPOINT_SNAP_TOLERANCE = 1e-6

export interface PathBuilderState {
  loops: Point2D[][]
  current: Point2D[]
  subpathStart: Point2D | null
  /** Whether the current subpath has seen an explicit `Z` command. */
  closed: boolean
  /** Whether any subpath was abandoned without an explicit close. */
  sawOpen: boolean
}

export function newPathBuilderState(): PathBuilderState {
  return { loops: [], current: [], subpathStart: null, closed: false, sawOpen: false }
}

type PathSegment = Parameters<Parameters<ReturnType<typeof svgpath>["iterate"]>[0]>[0]

const PATH_SEGMENT_HANDLERS: Record<string, (s: PathSegment, st: PathBuilderState) => void> = {
  M: handleMoveTo,
  L: handleLineTo,
  H: handleHorizontalLineTo,
  V: handleVerticalLineTo,
  C: handleCubicTo,
  Q: handleQuadraticTo,
  Z: (_s, st) => {
    st.closed = true
    flushCurrentSubpath(st)
  },
  z: (_s, st) => {
    st.closed = true
    flushCurrentSubpath(st)
  },
}

export function handlePathSegment(segment: PathSegment, state: PathBuilderState): void {
  const handler = PATH_SEGMENT_HANDLERS[segment[0]]
  // After `.unarc().unshort().abs()` only M/L/H/V/C/Q/Z survive — any
  // other token reaching here is a library bug and is dropped silently.
  if (handler) handler(segment, state)
}

export function finalisePathBuilder(state: PathBuilderState): void {
  // End-of-iteration: any subpath still open without a Z is dropped.
  // Flush only when explicitly closed (handlePathSegment with Z already
  // flushed those). Pending unclosed work counts as "open path seen".
  if (state.current.length > 0) state.sawOpen = true
  state.current = []
  state.subpathStart = null
  state.closed = false
}

function handleMoveTo(segment: PathSegment, state: PathBuilderState): void {
  // Narrow the segment via discriminant check on segment[0]. The
  // dispatcher routes only `M` here, so the guard never fires at
  // runtime; it exists so TS sees segment[1]/segment[2] as `number`.
  if (segment[0] !== "M") return
  // An `M` after an open subpath ends that subpath WITHOUT closing it.
  // Drop the vertices and flag the open-path warning rather than silently
  // promoting an L-chain into a polygon.
  if (state.current.length > 0 && !state.closed) {
    state.sawOpen = true
    state.current = []
    state.subpathStart = null
  }
  state.closed = false
  const x = segment[1]
  const y = segment[2]
  state.current.push({ x, y })
  state.subpathStart = { x, y }
}

function handleLineTo(segment: PathSegment, state: PathBuilderState): void {
  if (segment[0] !== "L") return
  primeIfEmpty(state)
  state.current.push({ x: segment[1], y: segment[2] })
}

function handleHorizontalLineTo(segment: PathSegment, state: PathBuilderState): void {
  if (segment[0] !== "H") return
  const lastY =
    state.current.length > 0
      ? state.current[state.current.length - 1].y
      : (state.subpathStart?.y ?? 0)
  primeIfEmpty(state)
  state.current.push({ x: segment[1], y: lastY })
}

function handleVerticalLineTo(segment: PathSegment, state: PathBuilderState): void {
  if (segment[0] !== "V") return
  const lastX =
    state.current.length > 0
      ? state.current[state.current.length - 1].x
      : (state.subpathStart?.x ?? 0)
  primeIfEmpty(state)
  state.current.push({ x: lastX, y: segment[1] })
}

function handleCubicTo(segment: PathSegment, state: PathBuilderState): void {
  if (segment[0] !== "C") return
  const p0 = state.current.length > 0 ? state.current[state.current.length - 1] : state.subpathStart
  if (!p0) return
  const cubic: CubicBezier = {
    p0,
    p1: { x: segment[1], y: segment[2] },
    p2: { x: segment[3], y: segment[4] },
    p3: { x: segment[5], y: segment[6] },
  }
  const verts = tessellateBezier(cubic)
  // tessellateBezier emits leading endpoint + midpoints. The leading
  // endpoint is `p0`, already present in `current`, so skip index 0.
  for (let i = 1; i < verts.length; i++) state.current.push(verts[i])
  state.current.push(cubic.p3)
}

function handleQuadraticTo(segment: PathSegment, state: PathBuilderState): void {
  if (segment[0] !== "Q") return
  const p0 = state.current.length > 0 ? state.current[state.current.length - 1] : state.subpathStart
  if (!p0) return
  const quad: QuadraticBezier = {
    p0,
    p1: { x: segment[1], y: segment[2] },
    p2: { x: segment[3], y: segment[4] },
  }
  const verts = tessellateQuadratic(quad)
  for (let i = 1; i < verts.length; i++) state.current.push(verts[i])
  state.current.push(quad.p2)
}

function primeIfEmpty(state: PathBuilderState): void {
  if (state.current.length === 0 && state.subpathStart) {
    state.current.push(state.subpathStart)
  }
}

function flushCurrentSubpath(state: PathBuilderState): void {
  // Only emit when the subpath was explicitly closed (Z). Open subpaths
  // are dropped — silently force-closing an L-chain would produce a
  // phantom polygon the operator never drew.
  if (state.closed && state.current.length >= 3 && state.subpathStart) {
    const last = state.current[state.current.length - 1]
    if (
      Math.abs(last.x - state.subpathStart.x) > ENDPOINT_SNAP_TOLERANCE ||
      Math.abs(last.y - state.subpathStart.y) > ENDPOINT_SNAP_TOLERANCE
    ) {
      // Snap to the start vertex (Z does this implicitly per spec).
      state.current.push({ x: state.subpathStart.x, y: state.subpathStart.y })
    }
    // Drop the closing duplicate — group-parts works on open vertex lists.
    const trimmed = sameWithin(
      state.current[0],
      state.current[state.current.length - 1],
      ENDPOINT_SNAP_TOLERANCE
    )
      ? state.current.slice(0, -1)
      : state.current
    if (trimmed.length >= 3) state.loops.push(trimmed)
  } else if (state.current.length > 0) {
    state.sawOpen = true
  }
  state.current = []
  state.subpathStart = null
  state.closed = false
}

function sameWithin(a: Point2D, b: Point2D, tol: number): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
}
