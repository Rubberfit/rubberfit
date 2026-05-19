import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"

const CURRENCY_CODE_REGEX = /^[A-Z]{3}$/

/**
 * ISO-4217 currency code. Stores a 3-letter uppercase code (USD, EUR,
 * GBP, …). Format-validated only — no closed set, so adding support for
 * a new currency requires no code change.
 *
 * No metadata (symbol, decimal places, name): that's a UI/i18n concern.
 * Display formatting goes through `Intl.NumberFormat(locale, { style:
 * "currency", currency: code })` at the boundary, which has the metadata
 * baked in. If we ever need server-side metadata (e.g., for backend PDF
 * rendering), it lands in a separate lookup module — not on the VO.
 *
 * Lifecycle:
 *   create(code)            → user-supplied; uppercases + validates format
 *   fromPersistence(code)   → DB-sourced; trusted, no validation
 */
export class Currency {
  public readonly value: string

  private constructor(value: string) {
    this.value = value
  }

  static create(code: string): Currency {
    const normalized = code.toUpperCase()
    if (!CURRENCY_CODE_REGEX.test(normalized)) {
      throw new InvalidValueObjectError(
        "Currency",
        "must be a 3-letter ISO-4217 code (e.g., USD)",
        code
      )
    }
    return new Currency(normalized)
  }

  static fromPersistence(value: string): Currency {
    return new Currency(value)
  }

  equals(other: Currency | null | undefined): boolean {
    if (!other) return false
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }

  toJSON(): string {
    return this.value
  }
}
