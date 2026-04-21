import type { Area, Length, Money, Percentage, PricePerArea } from "@/src/entities/value-objects"
import type { UnitSystem } from "./unit-system"

interface FormatOptions {
  metricPrecision?: number
  imperialPrecision?: number
}

export function formatLength(
  length: Length,
  unitSystem: UnitSystem,
  options: FormatOptions = {}
): string {
  if (unitSystem === "imperial") {
    const precision = options.imperialPrecision ?? 2
    return `${length.toInches().toFixed(precision)} in`
  }
  const precision = options.metricPrecision ?? 0
  return precision === 0
    ? `${length.mm} mm`
    : `${length.mm.toFixed(precision)} mm`
}

export function formatArea(
  area: Area,
  unitSystem: UnitSystem,
  options: FormatOptions = {}
): string {
  if (unitSystem === "imperial") {
    const precision = options.imperialPrecision ?? 2
    return `${area.toSqft().toFixed(precision)} ft²`
  }
  const precision = options.metricPrecision ?? 3
  return `${area.toSqm().toFixed(precision)} m²`
}

export function formatMoney(money: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(money.toDollars())
}

export function formatPricePerArea(
  price: PricePerArea,
  unitSystem: UnitSystem,
  locale = "en-US"
): string {
  const dollars =
    unitSystem === "imperial" ? price.toDollarsPerSqft() : price.toDollarsPerSqm()
  const unit = unitSystem === "imperial" ? "ft²" : "m²"
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency,
  }).format(dollars)
  return `${formatted}/${unit}`
}

export function formatPercentage(
  percentage: Percentage,
  options: { precision?: number } = {}
): string {
  const precision = options.precision ?? 2
  return `${percentage.toPercent().toFixed(precision)}%`
}
