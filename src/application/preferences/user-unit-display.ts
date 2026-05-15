/**
 * Display-only unit formatting helpers — convert canonical
 * inches / sqft values into the unit system the operator picked
 * on `/dashboard/settings/general` (`unitSystem: "imperial" | "metric"`).
 *
 * Design notes:
 *   - Pure functions. No DI, no React, no Supabase. Importable from
 *     `app/`, `src/infrastructure/services/`, PDF builders, anywhere.
 *   - The structural `UnitDisplayPreferencesInput` intentionally does
 *     NOT import `OrganizationPreferences` from `src/infrastructure`;
 *     that would invert the layer dependency. The canonical
 *     `OrganizationPreferences` object is assignable by shape, so
 *     call sites can pass it as-is.
 *   - Defaults mirror `DEFAULT_ORGANIZATION_PREFERENCES` in
 *     `src/infrastructure/models/organization-preferences.ts`.
 *     Mirror because of the layer rule above; tests guard the parity.
 *   - Display only. NEVER use these for filenames, CSV machine cells,
 *     DB payloads, packing-engine inputs, sort keys, or threshold math
 *     — canonical storage stays inches/sqft. Pair these with
 *     `getDisplayLengthValue` / `getDisplayAreaValue` if you need
 *     the raw converted number without unit text (e.g. Recharts data).
 *   - Returns `""` for non-finite / NaN inputs so a single bad row
 *     never explodes a render or a PDF page. Call sites that need a
 *     placeholder should write `formatLengthInches(...) || "—"`.
 *   - Leading-zero rule: helper always emits `0.32 cm`, never `.32 cm`.
 *
 * Conversion constants are NIST SP 811 Appendix B.8 exact values:
 *   1 inch  = 2.54 cm exactly
 *   1 sq ft = 0.09290304 m² exactly
 * https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors
 *
 * Area is converted from the final sqft value, never by converting
 * rounded cm dimensions and multiplying — that path accumulates
 * precision drift on offcut cells.
 */

import type { UnitSystem } from "@/src/application/preferences/constants"

export type { UnitSystem } from "@/src/application/preferences/constants"

export interface UnitDisplayPreferencesInput {
  unitSystem?: UnitSystem
}

export interface LengthFormatOptions {
  /** Decimal precision before trailing-zero strip. Defaults: imperial 4, metric 2. */
  precision?: number
  /** "symbol" → `12.5"` / `31.8 cm`. "word" → `12.5 inches` / `31.8 centimeters`. */
  unitStyle?: "symbol" | "word"
  /**
   * Snap the canonical inch value to the nearest 1/N before formatting
   * (e.g. `1 / 16` preserves cut-history-pdf's 1/16" rounding). The
   * snap is always applied; metric conversion derives from the snapped
   * inch value so PDF + canvas labels agree on the underlying
   * measurement.
   */
  snapInchesTo?: number
}

export interface AreaFormatOptions {
  /** Decimal precision. Defaults: imperial 1, metric 2. */
  precision?: number
  /** "symbol" → `125.5 sq ft` / `11.66 m²`. "word" → `125.5 square feet` / `11.66 square meters`. */
  unitStyle?: "symbol" | "word"
}

export interface DimensionFormatOptions {
  /** Per-axis precision. Defaults follow `LengthFormatOptions`. */
  precision?: number
  /** Axis separator. Defaults to `" × "` (U+00D7 with surrounding spaces). */
  separator?: string
  /** "symbol" → `48 × 120 × 0.125 in`. "word" → `48 by 120 by 0.125 inches`. */
  unitStyle?: "symbol" | "word"
}

export interface UnitDisplayParts {
  /** Formatted numeric portion only, e.g. `"31.75"` or `"125.5"`. */
  value: string
  /** Unit symbol or word, e.g. `"cm"`, `"sq ft"`, `"square meters"`. */
  unit: string
  /** Joined render: `value` + space + `unit`. */
  text: string
}

export interface NumericUnitDisplayParts {
  /** Numeric display value already converted to the chosen unit system. */
  value: number
  /** Matching unit symbol. */
  unit: string
}

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial"
export const INCHES_TO_CM = 2.54
export const SQFT_TO_M2 = 0.09290304

const DEFAULT_LENGTH_PRECISION_IMPERIAL = 4
const DEFAULT_LENGTH_PRECISION_METRIC = 2
const DEFAULT_AREA_PRECISION_IMPERIAL = 1
const DEFAULT_AREA_PRECISION_METRIC = 2
const DIMENSION_SEPARATOR = " × "

// ── Converters ────────────────────────────────────────────────────

export function convertLengthInchesToCm(value: number): number {
  return value * INCHES_TO_CM
}

export function convertAreaSqftToM2(value: number): number {
  return value * SQFT_TO_M2
}

// ── Unit-label getters ────────────────────────────────────────────

export function getLengthUnitLabel(
  preferences?: UnitDisplayPreferencesInput,
  options?: { unitStyle?: "symbol" | "word"; value?: number; singular?: boolean }
): string {
  const system = preferences?.unitSystem ?? DEFAULT_UNIT_SYSTEM
  const style = options?.unitStyle ?? "symbol"
  // Singular path: callers may pass an explicit `singular` boolean
  // (used by formatters that already rendered a numeric string and
  // know whether it reads "1") or a raw `value` for convenience
  // standalone use. `singular` wins when both are present.
  const singular =
    options?.singular ?? (options?.value !== undefined && Math.abs(options.value) === 1)
  if (system === "metric") {
    if (style === "word") return singular ? "centimeter" : "centimeters"
    return "cm"
  }
  if (style === "word") return singular ? "inch" : "inches"
  return '"'
}

export function getAreaUnitLabel(
  preferences?: UnitDisplayPreferencesInput,
  options?: { unitStyle?: "symbol" | "word" }
): string {
  const system = preferences?.unitSystem ?? DEFAULT_UNIT_SYSTEM
  const style = options?.unitStyle ?? "symbol"
  if (system === "metric") return style === "word" ? "square meters" : "m²"
  return style === "word" ? "square feet" : "sq ft"
}

// ── Numeric extractors (for chart data / CSV cells) ───────────────

export function getDisplayLengthValue(
  valueInches: number,
  preferences?: UnitDisplayPreferencesInput
): number {
  if (!Number.isFinite(valueInches)) return Number.NaN
  return preferences?.unitSystem === "metric" ? convertLengthInchesToCm(valueInches) : valueInches
}

export function getDisplayAreaValue(
  valueSqft: number,
  preferences?: UnitDisplayPreferencesInput
): number {
  if (!Number.isFinite(valueSqft)) return Number.NaN
  return preferences?.unitSystem === "metric" ? convertAreaSqftToM2(valueSqft) : valueSqft
}

export function getAreaDisplayParts(
  value: number,
  preferences?: UnitDisplayPreferencesInput
): NumericUnitDisplayParts {
  return {
    value: getDisplayAreaValue(value, preferences),
    unit: getAreaUnitLabel(preferences),
  }
}

// ── Length formatters ─────────────────────────────────────────────

function stripTrailingZeros(text: string): string {
  if (!text.includes(".")) return text
  return text.replace(/\.?0+$/, "")
}

function formatNumberWithLeadingZero(value: number, precision: number): string {
  // Number.prototype.toFixed already emits `0.32`, never `.32`, for
  // values in (-1, 1). Negative-zero collapses to `0` after strip.
  const fixed = value.toFixed(precision)
  const stripped = stripTrailingZeros(fixed)
  return stripped === "-0" ? "0" : stripped
}

function snapToStep(value: number, step?: number): number {
  if (!step || step <= 0) return value
  return Math.round(value / step) * step
}

function defaultLengthPrecision(system: UnitSystem): number {
  return system === "metric" ? DEFAULT_LENGTH_PRECISION_METRIC : DEFAULT_LENGTH_PRECISION_IMPERIAL
}

function joinValueAndUnit(value: string, unit: string, style: "symbol" | "word"): string {
  if (style === "word") return `${value} ${unit}`
  // Imperial symbol is the unspaced `"`; metric `cm` reads better with a space.
  if (unit === '"') return `${value}"`
  return `${value} ${unit}`
}

export function formatLengthInches(
  value: number,
  preferences?: UnitDisplayPreferencesInput,
  options?: LengthFormatOptions
): string {
  const parts = formatLengthInchesParts(value, preferences, options)
  if (parts.text === "") return ""
  return parts.text
}

export function formatLengthInchesParts(
  value: number,
  preferences?: UnitDisplayPreferencesInput,
  options?: LengthFormatOptions
): UnitDisplayParts {
  if (!Number.isFinite(value)) return { value: "", unit: "", text: "" }
  const system = preferences?.unitSystem ?? DEFAULT_UNIT_SYSTEM
  const style = options?.unitStyle ?? "symbol"
  const snapped = snapToStep(value, options?.snapInchesTo)
  const display = system === "metric" ? convertLengthInchesToCm(snapped) : snapped
  const precision = options?.precision ?? defaultLengthPrecision(system)
  const valueText = formatNumberWithLeadingZero(display, precision)
  // Drive singular off the rendered numeric string, not the raw float —
  // `0.999` at `precision: 0` shows "1" and must read "1 inch", not
  // "1 inches". `1.5` keeps the plural label even though Math.abs(value)
  // is 1.5 because the rendered string is "1.5".
  const singular = valueText === "1" || valueText === "-1"
  const unit = getLengthUnitLabel(preferences, { unitStyle: style, singular })
  return { value: valueText, unit, text: joinValueAndUnit(valueText, unit, style) }
}

// ── Area formatters ───────────────────────────────────────────────

function defaultAreaPrecision(system: UnitSystem): number {
  return system === "metric" ? DEFAULT_AREA_PRECISION_METRIC : DEFAULT_AREA_PRECISION_IMPERIAL
}

export function formatAreaSqft(
  value: number,
  preferences?: UnitDisplayPreferencesInput,
  options?: AreaFormatOptions
): string {
  return formatAreaSqftParts(value, preferences, options).text
}

export function formatAreaSqftParts(
  value: number,
  preferences?: UnitDisplayPreferencesInput,
  options?: AreaFormatOptions
): UnitDisplayParts {
  if (!Number.isFinite(value)) return { value: "", unit: "", text: "" }
  const system = preferences?.unitSystem ?? DEFAULT_UNIT_SYSTEM
  const style = options?.unitStyle ?? "symbol"
  const display = system === "metric" ? convertAreaSqftToM2(value) : value
  const precision = options?.precision ?? defaultAreaPrecision(system)
  const valueText = formatNumberWithLeadingZero(display, precision)
  const unit = getAreaUnitLabel(preferences, { unitStyle: style })
  return { value: valueText, unit, text: `${valueText} ${unit}` }
}

// ── Dimension-pair / triple formatter ─────────────────────────────

function formatLengthValueOnly(
  value: number,
  system: UnitSystem,
  precision: number,
  snapInchesTo?: number
): string {
  if (!Number.isFinite(value)) return ""
  const snapped = snapToStep(value, snapInchesTo)
  const display = system === "metric" ? convertLengthInchesToCm(snapped) : snapped
  return formatNumberWithLeadingZero(display, precision)
}

/**
 * Renders a 2- or 3-tuple of inch dimensions with a single trailing
 * unit symbol per Kimi's unit-at-end rule: `48 × 120 × 0.125 in` /
 * `121.92 × 304.8 × 0.32 cm`. Returns `""` if any value is non-finite
 * so PDF / canvas rows don't render `NaN × 12.5 ×`.
 */
export function formatDimensionsInches(
  values: readonly [number, number] | readonly [number, number, number],
  preferences?: UnitDisplayPreferencesInput,
  options?: DimensionFormatOptions
): string {
  if (values.some((v) => !Number.isFinite(v))) return ""
  const system = preferences?.unitSystem ?? DEFAULT_UNIT_SYSTEM
  const style = options?.unitStyle ?? "symbol"
  const precision = options?.precision ?? defaultLengthPrecision(system)
  const separator = options?.separator ?? DIMENSION_SEPARATOR
  const parts = values.map((v) => formatLengthValueOnly(v, system, precision, undefined))
  const joined = parts.join(separator)
  const unit =
    style === "word"
      ? getLengthUnitLabel(preferences, { unitStyle: "word" })
      : system === "metric"
        ? "cm"
        : "in"
  return `${joined} ${unit}`
}

/**
 * Speech-friendly variant for screen readers: spells "by" between
 * axes and the unit as a word, never quote marks or `×`.
 * `"30.5 by 45.7 centimeters"` / `"12 by 18 inches"`.
 */
export function formatDimensionsInchesForSpeech(
  values: readonly [number, number] | readonly [number, number, number],
  preferences?: UnitDisplayPreferencesInput
): string {
  return formatDimensionsInches(values, preferences, {
    separator: " by ",
    unitStyle: "word",
  })
}
