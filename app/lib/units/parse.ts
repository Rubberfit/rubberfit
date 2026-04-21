import { Area, Length, Money, PricePerArea } from "@/src/entities/value-objects"
import type { UnitSystem } from "./unit-system"

export class ParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ParseError"
  }
}

function parseFiniteNumber(input: string, fieldName: string): number {
  const trimmed = input.trim()
  if (trimmed === "") throw new ParseError(`${fieldName} is empty`)
  const num = Number(trimmed)
  if (!Number.isFinite(num)) throw new ParseError(`${fieldName} is not a number`)
  return num
}

export function parseLength(input: string, unitSystem: UnitSystem): Length {
  const num = parseFiniteNumber(input, "length")
  return unitSystem === "imperial" ? Length.fromInches(num) : Length.fromMm(num)
}

export function parseArea(input: string, unitSystem: UnitSystem): Area {
  const num = parseFiniteNumber(input, "area")
  return unitSystem === "imperial" ? Area.fromSqft(num) : Area.fromSqm(num)
}

export function parseMoney(input: string, currency: string): Money {
  const num = parseFiniteNumber(input, "money")
  return Money.fromDollars(num, currency)
}

export function parsePricePerArea(
  input: string,
  unitSystem: UnitSystem,
  currency: string
): PricePerArea {
  const num = parseFiniteNumber(input, "price")
  return unitSystem === "imperial"
    ? PricePerArea.fromDollarsPerSqft(num, currency)
    : PricePerArea.fromDollarsPerSqm(num, currency)
}
