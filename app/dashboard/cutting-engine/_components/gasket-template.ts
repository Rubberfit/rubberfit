import {
  buildFullFaceGasket,
  type FullFaceGasketSpec,
} from "@/src/application/gasket/full-face-gasket"
import {
  buildObroundGasket,
  type ObroundGasketSpec,
} from "@/src/application/gasket/obround-gasket"
import {
  buildRingGasket,
  type RingGasketSpec,
} from "@/src/application/gasket/ring-gasket"

import type { PartTemplate } from "./preset-template-data"

export type GasketSpec =
  | ({ kind: "ring" } & RingGasketSpec)
  | ({ kind: "full-face" } & FullFaceGasketSpec)
  | ({ kind: "obround" } & ObroundGasketSpec)

/**
 * Convert a gasket spec into a queue-ready PartTemplate. The dialog
 * (Commit 5) fills in `id` + `quantity` + `partNumber`; this adapter
 * owns label/summary/dimensions/polygon. Output flows through
 * `templateToPart -> buildPart -> pack-cli` exactly like a DXF-imported
 * gasket — gasket primitives share the `partType: "polygon"` lane the
 * existing CAD-import path uses.
 *
 * `width` / `length` on the returned template reflect the operator's
 * NOMINAL input (e.g. 12.0 for OD 12″ ring), not the tessellated
 * polygon's bbox (which is slightly inscribed by the chord-deviation
 * budget). The polygon vertices are the geometric truth the packer
 * uses; the bbox fields are operator-intent metadata for queue display
 * and initial placement.
 */
export function gasketSpecToPartTemplate(spec: GasketSpec): Omit<PartTemplate, "id" | "quantity"> {
  switch (spec.kind) {
    case "ring": {
      return {
        partType: "polygon",
        label: `Ring · OD ${formatDim(spec.outerDiameter)} ID ${formatDim(spec.innerDiameter)}`,
        summary: "Ring",
        category: "custom",
        width: spec.outerDiameter,
        length: spec.outerDiameter,
        renderShape: "polygon",
        polygon: buildRingGasket(spec),
        isCustom: true,
      }
    }
    case "full-face": {
      return {
        partType: "polygon",
        label: `Full-face · OD ${formatDim(spec.outerDiameter)} ${spec.boltCount}×${formatDim(spec.boltHoleDiameter)}`,
        summary: "Full-face",
        category: "custom",
        width: spec.outerDiameter,
        length: spec.outerDiameter,
        renderShape: "polygon",
        polygon: buildFullFaceGasket(spec),
        isCustom: true,
      }
    }
    case "obround": {
      return {
        partType: "polygon",
        label: `Obround · ${formatDim(spec.length)} × ${formatDim(spec.width)}`,
        summary: "Obround",
        category: "custom",
        width: spec.length,
        length: spec.width,
        renderShape: "polygon",
        polygon: buildObroundGasket(spec),
        isCustom: true,
      }
    }
    default: {
      const _exhaustive: never = spec
      throw new Error(`gasketSpecToPartTemplate: unknown kind ${JSON.stringify(_exhaustive)}`)
    }
  }
}

function formatDim(n: number): string {
  // Drop trailing zeros; cap at 3 dp.
  const s = n.toFixed(3)
  return `${s.replace(/\.?0+$/, "")}″`
}
