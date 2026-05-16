// Warning-line builders for the DXF + SVG review dialogs. Split out of
// `cad-review-dialog-parts.tsx` so the parts file stays under the
// per-file line budget.
//
// Every string here is operator-facing copy. Counts collapse on the
// `originalType:reason` key so the banner shows one line per category
// of issue rather than one line per entity.

import type { RejectedEntity } from "@/src/application/cad/dxf-types"
import type { SvgRejectedEntity } from "@/src/application/cad/svg-types"

export function buildDxfWarnings(rejected: RejectedEntity[], ignoredLayers: string[]): string[] {
  const messages: string[] = []
  const counts = new Map<string, number>()
  for (const r of rejected) {
    const key = `${r.originalType}:${r.reason}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of counts) {
    const [type, reason] = key.split(":")
    messages.push(dxfReasonCopy(type, reason, count))
  }
  if (ignoredLayers.length > 0) {
    messages.push(`Ignored layers (single-layer import): ${ignoredLayers.join(", ")}.`)
  }
  return messages
}

function dxfReasonCopy(type: string, reason: string, count: number): string {
  const plural = count === 1 ? "entity" : "entities"
  switch (reason) {
    case "polyline-curve-fit":
    case "polyline-spline-fit":
      return `${count} ${type} ${plural} ignored — curve-fit polylines are not supported.`
    case "polyline-3d":
    case "polyline-3d-mesh":
    case "polyline-polyface-mesh":
      return `${count} ${type} ${plural} ignored — 3D / mesh polylines are not supported.`
    case "polyline-not-closed":
    case "lwpolyline-not-closed":
      return `${count} open ${type} ${plural} ignored — closed loops only.`
    case "spline-rational-not-supported":
      return `${count} rational ${type} ${plural} ignored — flatten weighted splines in CAD before importing.`
    case "spline-malformed":
      return `${count} malformed ${type} ${plural} ignored — check the knot vector and control points.`
    case "entity-type-unsupported":
      return `${count} ${type} ${plural} ignored.`
    default:
      return `${count} ${type} ${plural} ignored (${reason}).`
  }
}

export function buildSvgWarnings(rejected: SvgRejectedEntity[]): string[] {
  const messages: string[] = []
  const counts = new Map<string, number>()
  for (const r of rejected) {
    const key = `${r.originalType}:${r.reason}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (const [key, count] of counts) {
    const [type, reason] = key.split(":")
    messages.push(svgReasonCopy(type, reason, count))
  }
  return messages
}

function svgReasonCopy(type: string, reason: string, count: number): string {
  const plural = count === 1 ? "element" : "elements"
  switch (reason) {
    case "use-element-unsupported":
      return `${count} <use> ${plural} ignored — flatten symbol references before importing.`
    case "defs-element-unsupported":
      return `${count} <defs> ${plural} ignored — inline symbols before importing.`
    case "text-element-unsupported":
      return `${count} text ${plural} ignored — convert text to paths first.`
    case "image-element-unsupported":
      return `${count} raster image ${plural} ignored — only vector geometry is imported.`
    case "clip-path-unsupported":
      return `${count} clip-path ${plural} ignored — boolean clipping is not supported.`
    case "mask-unsupported":
      return `${count} mask ${plural} ignored — boolean masking is not supported.`
    case "gradient-unsupported":
    case "pattern-unsupported":
    case "filter-unsupported":
      return `${count} ${type} ${plural} ignored — paint server ignored, geometry only.`
    case "foreign-object-unsupported":
      return `${count} foreignObject ${plural} ignored.`
    case "open-path-no-z":
      return `${count} open ${type} ${plural} ignored — closed paths only (add a Z command).`
    case "polyline-not-closeable":
      return `${count} non-closing polyline ${plural} ignored — start point must match end point.`
    case "line-not-closeable":
      return `${count} <line> ${plural} ignored — single segments cannot form a closed loop.`
    case "path-malformed":
      return `${count} malformed ${type} ${plural} ignored — check the d attribute.`
    case "element-type-unsupported":
      return `${count} ${type} ${plural} ignored.`
    default:
      return `${count} ${type} ${plural} ignored (${reason}).`
  }
}
