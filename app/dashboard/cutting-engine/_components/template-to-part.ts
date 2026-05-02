// Convert a UI `PartTemplate` (preset/uploaded part with dimensions) into a
// canonical `Part` for the Rust autonester. Shape-spec only — Rust
// materialises the polygon at pack time via
// `rf_layout::application::shape_builder`.
//
// Cylinders pre-unroll to a `{ width: π·d, height }` rectangle since
// jagua-rs packs the unrolled rectangle as the cut profile. Cones map to
// the canonical "sector" shape spec; the rendered cone strategy is
// chosen at pack-request time.
//
// Returns null when the template is missing a required dimension or has
// degenerate values that `buildPart` would throw on. Callers filter
// nulls so the visualizer's overflow badge surfaces the resulting
// low part-count instead of crashing the page.

import { buildPart } from "@/src/application/packing/buildPart"
import type { Part } from "@/src/application/packing/types"
import type { PartTemplate } from "./preset-template-data"

export function templateToPart(template: PartTemplate, tag: string | undefined): Part | null {
  const quantity = Math.max(1, template.quantity)
  try {
    switch (template.partType) {
      case "rectangle": {
        const width = template.width
        const length = template.length
        if (!(width && length)) return null
        return buildPart({
          shapeId: template.id,
          quantity,
          shapeSpec: { kind: "rect", params: { width, height: length } },
          allowRotation: true,
          tag,
        })
      }
      case "cylinder": {
        const d = template.diameter
        const h = template.height
        if (!(d && h)) return null
        return buildPart({
          shapeId: template.id,
          quantity,
          shapeSpec: { kind: "rect", params: { width: Math.PI * d, height: h } },
          allowRotation: true,
          tag,
        })
      }
      case "circle": {
        const d = template.diameter
        if (!d) return null
        return buildPart({
          shapeId: template.id,
          quantity,
          shapeSpec: { kind: "circle", params: { diameter: d } },
          allowRotation: true,
          tag,
        })
      }
      case "cone": {
        const innerRadius = template.innerRadius
        const outerRadius = template.outerRadius
        const arcDegrees = template.arcDegrees
        if (!(innerRadius != null && outerRadius && arcDegrees)) return null
        return buildPart({
          shapeId: template.id,
          quantity,
          shapeSpec: {
            kind: "sector",
            params: { innerRadius, outerRadius, arcDegrees },
          },
          allowRotation: true,
          tag,
        })
      }
      case "trapezoid": {
        const topWidth = template.topWidth
        const bottomWidth = template.bottomWidth
        const h = template.height
        if (!(topWidth && bottomWidth && h)) return null
        return buildPart({
          shapeId: template.id,
          quantity,
          shapeSpec: {
            kind: "trapezoid",
            params: { topWidth, bottomWidth, height: h },
          },
          allowRotation: true,
          tag,
        })
      }
      default:
        return null
    }
  } catch (_error) {
    // buildPart throws on degenerate dimensions (negative widths,
    // sub-3-vertex polygons, etc.) — drop the part rather than
    // crashing the page.
    return null
  }
}
