// Detect physical units from a root <svg> element.
//
// SVG units come from the `width` and `height` attributes which may
// carry a CSS unit suffix (mm, cm, in, px) or be unit-less (user units).
//
//   width="100mm"  -> "mm"
//   width="4in"    -> "inch"
//   width="10cm"   -> "mm" (converted on output via a scale)
//   width="800"    -> undefined (user units; operator picks mm vs inch)
//   width="100px"  -> undefined (illustration tools; operator picks)
//
// We do NOT honour DPI conversion from px to mm — operators routinely
// export from web tooling with mismatched DPI assumptions. Failing
// closed (returning undefined) makes the Review dialog prompt for a
// unit choice rather than silently scaling at 96 DPI.

import type { UnitSystem } from "@/src/application/packing/types"

interface SvgRootAttributes {
  width?: string
  height?: string
  viewBox?: string
}

export interface DetectedSvgUnits {
  units: UnitSystem | undefined
  /**
   * Scale factor from raw vertex coordinates to physical units.
   *
   * When `width="100mm" viewBox="0 0 200 200"` we have 100mm spread
   * over 200 user units, so each user unit equals 0.5mm. Apply this
   * to every vertex during tessellation to keep downstream geometry
   * in the operator's selected unit system.
   *
   * Defaults to 1 (no scaling) when the viewBox is missing or there
   * is no unit suffix to derive a conversion from.
   */
  userUnitScale: number
}

export function detectSvgUnits(attrs: SvgRootAttributes): DetectedSvgUnits {
  const parsed = parseLength(attrs.width)
  const viewBoxW = parseViewBoxWidth(attrs.viewBox)

  if (parsed === null) {
    return { units: undefined, userUnitScale: 1 }
  }

  const physicalMm = toMillimetres(parsed.value, parsed.unit)
  if (physicalMm === null) {
    return { units: undefined, userUnitScale: 1 }
  }

  // The physical width corresponds to `viewBoxW` user units (or to
  // `parsed.value` if no viewBox is set — width without viewBox means
  // 1 user unit = 1 unit of the suffix).
  const userUnits = viewBoxW ?? parsed.value
  if (userUnits <= 0) {
    return { units: undefined, userUnitScale: 1 }
  }

  // Pick the unit system that requires the smallest conversion. mm and
  // cm collapse to mm; in collapses to inch. The scale below is in the
  // chosen unit system, not millimetres.
  if (parsed.unit === "in") {
    const physicalInches = parsed.value
    return { units: "inch", userUnitScale: physicalInches / userUnits }
  }
  return { units: "mm", userUnitScale: physicalMm / userUnits }
}

interface ParsedLength {
  value: number
  unit: "mm" | "cm" | "in" | "px" | ""
}

function parseLength(raw: string | undefined): ParsedLength | null {
  if (raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const match = /^([+-]?\d+(?:\.\d+)?)\s*(mm|cm|in|px)?$/i.exec(trimmed)
  if (!match) return null
  const value = parseFloat(match[1])
  if (!Number.isFinite(value)) return null
  const unit = (match[2]?.toLowerCase() ?? "") as ParsedLength["unit"]
  return { value, unit }
}

function toMillimetres(value: number, unit: ParsedLength["unit"]): number | null {
  switch (unit) {
    case "mm":
      return value
    case "cm":
      return value * 10
    case "in":
      return value * 25.4
    case "px":
    case "":
      // px and unit-less are ambiguous without a DPI assumption. We
      // fail closed and let the operator pick mm vs inch in the dialog.
      return null
  }
}

function parseViewBoxWidth(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const parts = raw.trim().split(/[\s,]+/)
  if (parts.length < 3) return null
  const width = parseFloat(parts[2])
  return Number.isFinite(width) && width > 0 ? width : null
}
