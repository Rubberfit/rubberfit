import { describe, expect, it } from "vitest"

import { SUPPORTED_UNIT_SYSTEMS } from "@/src/application/preferences/constants"
import {
  DEFAULT_UNIT_SYSTEM,
  INCHES_TO_CM,
  SQFT_TO_M2,
  convertAreaSqftToM2,
  convertLengthInchesToCm,
  formatAreaSqft,
  formatAreaSqftParts,
  formatDimensionsInches,
  formatDimensionsInchesForSpeech,
  formatLengthInches,
  formatLengthInchesParts,
  getAreaDisplayParts,
  getAreaUnitLabel,
  getDisplayAreaValue,
  getDisplayLengthValue,
  getLengthUnitLabel,
} from "@/src/application/preferences/user-unit-display"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"

/**
 * The helper deliberately does not import DEFAULT_ORGANIZATION_PREFERENCES
 * from the infrastructure layer (would invert layer rules). This test
 * guards the duplication so a future change to the canonical defaults
 * can't silently leave the helper stale.
 */
describe("default parity with DEFAULT_ORGANIZATION_PREFERENCES", () => {
  it("unitSystem default matches the canonical org-preferences default", () => {
    expect(DEFAULT_UNIT_SYSTEM).toBe(DEFAULT_ORGANIZATION_PREFERENCES.unitSystem)
  })
})

describe("conversion constants — NIST SP 811 Appendix B.8 exact values", () => {
  it("INCHES_TO_CM is exactly 2.54", () => {
    expect(INCHES_TO_CM).toBe(2.54)
  })
  it("SQFT_TO_M2 is exactly 0.09290304", () => {
    expect(SQFT_TO_M2).toBe(0.09290304)
  })
  it("convertLengthInchesToCm(1) returns 2.54", () => {
    expect(convertLengthInchesToCm(1)).toBe(2.54)
  })
  it("convertAreaSqftToM2(1) returns 0.09290304", () => {
    expect(convertAreaSqftToM2(1)).toBe(0.09290304)
  })
})

describe("getLengthUnitLabel", () => {
  it("imperial symbol returns the inch quote mark", () => {
    expect(getLengthUnitLabel({ unitSystem: "imperial" })).toBe('"')
  })
  it("metric symbol returns cm", () => {
    expect(getLengthUnitLabel({ unitSystem: "metric" })).toBe("cm")
  })
  it("imperial word plural", () => {
    expect(getLengthUnitLabel({ unitSystem: "imperial" }, { unitStyle: "word" })).toBe("inches")
  })
  it("imperial word singular when value is exactly 1", () => {
    expect(getLengthUnitLabel({ unitSystem: "imperial" }, { unitStyle: "word", value: 1 })).toBe(
      "inch"
    )
  })
  it("metric word singular when value is exactly -1", () => {
    expect(getLengthUnitLabel({ unitSystem: "metric" }, { unitStyle: "word", value: -1 })).toBe(
      "centimeter"
    )
  })
  it("falls back to imperial when no preference is passed", () => {
    expect(getLengthUnitLabel()).toBe('"')
  })
})

describe("getAreaUnitLabel", () => {
  it("imperial symbol returns sq ft with a space", () => {
    expect(getAreaUnitLabel({ unitSystem: "imperial" })).toBe("sq ft")
  })
  it("metric symbol returns m² (Unicode superscript)", () => {
    expect(getAreaUnitLabel({ unitSystem: "metric" })).toBe("m²")
  })
  it("imperial word", () => {
    expect(getAreaUnitLabel({ unitSystem: "imperial" }, { unitStyle: "word" })).toBe("square feet")
  })
  it("metric word", () => {
    expect(getAreaUnitLabel({ unitSystem: "metric" }, { unitStyle: "word" })).toBe("square meters")
  })
})

describe("getDisplayLengthValue / getDisplayAreaValue", () => {
  it("passes imperial inches through unchanged", () => {
    expect(getDisplayLengthValue(12.5, { unitSystem: "imperial" })).toBe(12.5)
  })
  it("converts to cm for metric", () => {
    expect(getDisplayLengthValue(1, { unitSystem: "metric" })).toBe(2.54)
  })
  it("passes imperial sqft through unchanged", () => {
    expect(getDisplayAreaValue(125.5, { unitSystem: "imperial" })).toBe(125.5)
  })
  it("converts to m² for metric", () => {
    expect(getDisplayAreaValue(1, { unitSystem: "metric" })).toBe(0.09290304)
  })
  it("returns NaN for non-finite inputs so callers can branch", () => {
    expect(getDisplayLengthValue(Number.NaN, { unitSystem: "metric" })).toBeNaN()
    expect(getDisplayAreaValue(Infinity, { unitSystem: "imperial" })).toBeNaN()
  })
})

describe("getAreaDisplayParts (Recharts / CSV helper)", () => {
  it("imperial returns canonical sqft + sq ft unit", () => {
    expect(getAreaDisplayParts(125.5, { unitSystem: "imperial" })).toEqual({
      value: 125.5,
      unit: "sq ft",
    })
  })
  it("metric returns converted m² value + m² unit", () => {
    const parts = getAreaDisplayParts(10, { unitSystem: "metric" })
    expect(parts.unit).toBe("m²")
    expect(parts.value).toBeCloseTo(0.9290304, 7)
  })
})

const INVALID_NUMBERS: ReadonlyArray<number> = [Number.NaN, Infinity, -Infinity]

describe("formatLengthInches — invalid input contract", () => {
  it.each(INVALID_NUMBERS)("returns empty string for %p", (value) => {
    expect(formatLengthInches(value)).toBe("")
    expect(formatLengthInches(value, { unitSystem: "metric" })).toBe("")
  })
  it("parts variant returns empty value/unit/text for non-finite", () => {
    expect(formatLengthInchesParts(Number.NaN)).toEqual({ value: "", unit: "", text: "" })
  })
})

describe("formatLengthInches — imperial passthrough + trailing-zero strip", () => {
  it("renders an integer with the inch quote mark", () => {
    expect(formatLengthInches(12, { unitSystem: "imperial" })).toBe('12"')
  })
  it("strips trailing zeros (12.5000 → 12.5)", () => {
    expect(formatLengthInches(12.5, { unitSystem: "imperial" })).toBe('12.5"')
  })
  it("renders 4-decimal precision before strip (12.0625)", () => {
    expect(formatLengthInches(12.0625, { unitSystem: "imperial" })).toBe('12.0625"')
  })
  it("defaults the unit when preferences omit unitSystem", () => {
    expect(formatLengthInches(8)).toBe('8"')
  })
})

describe("formatLengthInches — metric conversion + 2-decimal default", () => {
  it("converts 1 inch to 2.54 cm at default 2-decimal precision", () => {
    // Kimi delta: metric length default is 2 decimals so 0.125" thickness
    // renders as 0.32 cm, not 0.3 cm — material precision stays visible.
    expect(formatLengthInches(1, { unitSystem: "metric" })).toBe("2.54 cm")
  })
  it("renders 0.125 inch as 0.32 cm (leading-zero rule)", () => {
    expect(formatLengthInches(0.125, { unitSystem: "metric" })).toBe("0.32 cm")
  })
  it("strips trailing zeros in metric mode (12 in = 30.48 cm)", () => {
    expect(formatLengthInches(12, { unitSystem: "metric" })).toBe("30.48 cm")
  })
  it("respects an explicit precision override", () => {
    expect(formatLengthInches(1, { unitSystem: "metric" }, { precision: 4 })).toBe("2.54 cm")
    expect(formatLengthInches(0.125, { unitSystem: "metric" }, { precision: 4 })).toBe("0.3175 cm")
  })
})

describe("formatLengthInches — snapInchesTo (cut-history-pdf parity)", () => {
  it("snaps up to the nearest 1/16 inch (12.0626 → 12.0625)", () => {
    expect(formatLengthInches(12.0626, { unitSystem: "imperial" }, { snapInchesTo: 1 / 16 })).toBe(
      '12.0625"'
    )
  })
  it("snaps down when the input is closer to a smaller step (12.0312 → 12)", () => {
    // |12.0312 - 12.0| = 0.0312 < |12.0312 - 12.0625| = 0.0313, so the
    // input snaps DOWN to 192/16 = 12, not up to 193/16. Trailing-zero
    // strip makes the integer render as "12".
    expect(formatLengthInches(12.0312, { unitSystem: "imperial" }, { snapInchesTo: 1 / 16 })).toBe(
      '12"'
    )
  })
  it("snaps the metric render off the snapped inch value", () => {
    // Even in metric mode, the snap happens to the inch input first so
    // the canvas + PDF agree on the rendered measurement.
    const snapped = formatLengthInches(12.0626, { unitSystem: "metric" }, { snapInchesTo: 1 / 16 })
    // 12.0625 * 2.54 = 30.63875 → 2-dec strip → 30.64
    expect(snapped).toBe("30.64 cm")
  })
})

describe("formatLengthInches — word style for a11y", () => {
  it("renders imperial as inches with singular handling at 1", () => {
    expect(formatLengthInches(1, { unitSystem: "imperial" }, { unitStyle: "word" })).toBe("1 inch")
    expect(formatLengthInches(2, { unitSystem: "imperial" }, { unitStyle: "word" })).toBe(
      "2 inches"
    )
  })
  it("renders metric as centimeters", () => {
    expect(formatLengthInches(1, { unitSystem: "metric" }, { unitStyle: "word" })).toBe(
      "2.54 centimeters"
    )
  })
})

describe("formatLengthInches — singular agrees with rendered numeric string", () => {
  // Regression guard: an earlier draft drove the singular decision off
  // the raw float (`Math.abs(value) === 1`), so `0.999` at precision 0
  // rendered as "1 inches" even though the visible numeric was "1".
  // The contract is now: the noun follows the visible string.
  it("renders 0.999 at precision 0 as '1 inch', not '1 inches'", () => {
    expect(
      formatLengthInches(0.999, { unitSystem: "imperial" }, { unitStyle: "word", precision: 0 })
    ).toBe("1 inch")
  })
  it("renders 1.001 at precision 0 as '1 inch'", () => {
    expect(
      formatLengthInches(1.001, { unitSystem: "imperial" }, { unitStyle: "word", precision: 0 })
    ).toBe("1 inch")
  })
  it("renders 1.4 at precision 0 as '1 inch' (rounded numeric reads '1')", () => {
    expect(
      formatLengthInches(1.4, { unitSystem: "imperial" }, { unitStyle: "word", precision: 0 })
    ).toBe("1 inch")
  })
  it("renders 0.3937 in metric as '1 centimeter' (display reads '1' after 2-dec round)", () => {
    // 0.3937 × 2.54 = 1.000028 → 2-dec toFixed → "1.00" → strip → "1"
    expect(formatLengthInches(0.3937, { unitSystem: "metric" }, { unitStyle: "word" })).toBe(
      "1 centimeter"
    )
  })
  it("keeps plural when the rendered string is '1.5' (not '1')", () => {
    expect(formatLengthInches(1.5, { unitSystem: "imperial" }, { unitStyle: "word" })).toBe(
      "1.5 inches"
    )
  })
  it("getLengthUnitLabel honors an explicit singular boolean over value", () => {
    // The boolean wins when both are passed.
    expect(
      getLengthUnitLabel(
        { unitSystem: "imperial" },
        { unitStyle: "word", value: 2, singular: true }
      )
    ).toBe("inch")
  })
})

describe("formatLengthInchesParts — split rendering", () => {
  it("exposes value, unit, and joined text separately", () => {
    expect(formatLengthInchesParts(12.5, { unitSystem: "imperial" })).toEqual({
      value: "12.5",
      unit: '"',
      text: '12.5"',
    })
  })
  it("metric parts use a space separator in the joined text", () => {
    expect(formatLengthInchesParts(1, { unitSystem: "metric" })).toEqual({
      value: "2.54",
      unit: "cm",
      text: "2.54 cm",
    })
  })
})

describe("formatAreaSqft — invalid input contract", () => {
  it.each(INVALID_NUMBERS)("returns empty string for %p", (value) => {
    expect(formatAreaSqft(value)).toBe("")
  })
  it("parts variant returns empty value/unit/text for non-finite", () => {
    expect(formatAreaSqftParts(Number.NaN)).toEqual({ value: "", unit: "", text: "" })
  })
})

describe("formatAreaSqft — defaults", () => {
  it("imperial default precision is 1 decimal", () => {
    expect(formatAreaSqft(125.5, { unitSystem: "imperial" })).toBe("125.5 sq ft")
  })
  it("metric default precision is 2 decimals", () => {
    // 125.5 sq ft × 0.09290304 = 11.66063152 m² → 2-dec → 11.66
    expect(formatAreaSqft(125.5, { unitSystem: "metric" })).toBe("11.66 m²")
  })
  it("strips trailing zeros (125.0 → 125)", () => {
    expect(formatAreaSqft(125, { unitSystem: "imperial" })).toBe("125 sq ft")
  })
  it("leading-zero rule renders 0.X cleanly", () => {
    expect(formatAreaSqft(0.5, { unitSystem: "imperial" })).toBe("0.5 sq ft")
  })
})

describe("formatAreaSqft — precision override", () => {
  it("imperial with explicit precision 2 keeps both decimals when needed", () => {
    expect(formatAreaSqft(125.55, { unitSystem: "imperial" }, { precision: 2 })).toBe(
      "125.55 sq ft"
    )
  })
  it("strips trailing zeros even with explicit precision (125.50 → 125.5)", () => {
    expect(formatAreaSqft(125.5, { unitSystem: "imperial" }, { precision: 2 })).toBe("125.5 sq ft")
  })
})

describe("formatAreaSqft — word style", () => {
  it("renders imperial as square feet", () => {
    expect(formatAreaSqft(125, { unitSystem: "imperial" }, { unitStyle: "word" })).toBe(
      "125 square feet"
    )
  })
  it("renders metric as square meters", () => {
    expect(formatAreaSqft(125, { unitSystem: "metric" }, { unitStyle: "word" })).toBe(
      "11.61 square meters"
    )
  })
})

describe("formatDimensionsInches — 2-tuple", () => {
  it("renders imperial with unit at the end", () => {
    expect(formatDimensionsInches([12, 18], { unitSystem: "imperial" })).toBe("12 × 18 in")
  })
  it("renders metric with unit at the end (Kimi's unit-at-end rule)", () => {
    expect(formatDimensionsInches([12, 18], { unitSystem: "metric" })).toBe("30.48 × 45.72 cm")
  })
  it("returns empty string if any axis is non-finite", () => {
    expect(formatDimensionsInches([Number.NaN, 18], { unitSystem: "imperial" })).toBe("")
  })
})

describe("formatDimensionsInches — 3-tuple (W × L × T)", () => {
  it("renders imperial roll dims with single in suffix", () => {
    expect(formatDimensionsInches([48, 120, 0.125], { unitSystem: "imperial" })).toBe(
      "48 × 120 × 0.125 in"
    )
  })
  it("renders metric roll dims with 0.32 thickness (Kimi delta - 2 decimals)", () => {
    expect(formatDimensionsInches([48, 120, 0.125], { unitSystem: "metric" })).toBe(
      "121.92 × 304.8 × 0.32 cm"
    )
  })
})

describe("formatDimensionsInches — separator + precision overrides", () => {
  it("respects a custom separator", () => {
    expect(
      formatDimensionsInches([12, 18], { unitSystem: "imperial" }, { separator: " by " })
    ).toBe("12 by 18 in")
  })
  it("respects an explicit precision (metric precision 4)", () => {
    expect(formatDimensionsInches([1, 2], { unitSystem: "metric" }, { precision: 4 })).toBe(
      "2.54 × 5.08 cm"
    )
  })
})

describe("formatDimensionsInchesForSpeech — a11y", () => {
  it("renders imperial with spelled-out unit + 'by' separator", () => {
    expect(formatDimensionsInchesForSpeech([12, 18])).toBe("12 by 18 inches")
  })
  it("renders metric with spelled-out unit", () => {
    expect(formatDimensionsInchesForSpeech([12, 18], { unitSystem: "metric" })).toBe(
      "30.48 by 45.72 centimeters"
    )
  })
  it("never emits the × glyph or quote marks", () => {
    const text = formatDimensionsInchesForSpeech([48, 120, 0.125], { unitSystem: "imperial" })
    expect(text).not.toMatch(/×/)
    expect(text).not.toMatch(/"/)
    expect(text).toBe("48 by 120 by 0.125 inches")
  })
})

describe("SUPPORTED_UNIT_SYSTEMS round-trip", () => {
  // Defensive: every supported value must render something non-empty
  // for a finite input. Catches future additions to the constants tuple
  // that the helper forgets to handle.
  it.each(SUPPORTED_UNIT_SYSTEMS)("renders length for %s", (unitSystem) => {
    expect(formatLengthInches(12, { unitSystem })).not.toBe("")
  })
  it.each(SUPPORTED_UNIT_SYSTEMS)("renders area for %s", (unitSystem) => {
    expect(formatAreaSqft(125, { unitSystem })).not.toBe("")
  })
})
