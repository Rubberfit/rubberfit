import { InvalidValueObjectError } from "@/src/entities/errors/invalid-value-object.error"
import { Currency } from "@/src/entities/value-objects/currency"

/**
 * 2^53 - 1 = 9_007_199_254_740_991. Safe upper bound for integer cents
 * stored as a JS Number — equivalent to ~$90 trillion. The DB column is
 * `bigint`; the repository narrows to Number at the read boundary and
 * Money's factory rejects values exceeding the safe range.
 */
const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER

/** Boundary snapshot shape — used by RSC marshalling, JSON, DB reads. */
export interface MoneySnapshot {
  cents: number
  currency: string
}

/**
 * Monetary amount: integer cents + Currency. Always pair them — a bare
 * `number` of cents has no meaning without a currency, and bare currency
 * codes can't represent magnitudes.
 *
 * **Cross-currency arithmetic throws.** `USD($10).add(EUR($5))` is always
 * a bug. Explicit FX conversion lives in the use-case layer, not here.
 *
 * **Display formatting is external.** The VO exposes `toCents()` and
 * `toMajorUnits()`; UI calls `Intl.NumberFormat(locale, { style:
 * "currency", currency: money.currency.value })`. No `format()` method
 * here — keeps the VO narrow and locale resolution out of the entity layer.
 *
 * **Cents are JS Number, not bigint.** Safe to ±2^53-1 cents (~$90T).
 * The repository narrows DB `bigint → Number(value)` at read time.
 *
 * Lifecycle:
 *   fromCents(cents, currency)    → user-supplied; validates integer + safe range
 *   zero(currency)                → $0 / €0 / etc.
 *   fromPersistence(cents, code)  → DB-sourced; cents trusted, currency wraps fromPersistence
 */
export class Money {
  public readonly cents: number
  public readonly currency: Currency

  private constructor(cents: number, currency: Currency) {
    this.cents = cents
    this.currency = currency
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static fromCents(cents: number, currency: Currency): Money {
    Money.#assertValidCents(cents)
    return new Money(cents, currency)
  }

  /** $0 / €0 / etc. in the given currency. */
  static zero(currency: Currency): Money {
    return new Money(0, currency)
  }

  /**
   * Reconstruct from a persisted (cents, currencyCode) pair. No validation
   * on cents — the DB CHECK constraint already enforces non-negative on
   * the price columns, and Money allows negative (refunds, adjustments).
   */
  static fromPersistence(cents: number, currencyCode: string): Money {
    return new Money(cents, Currency.fromPersistence(currencyCode))
  }

  /** Reconstruct from a snapshot emitted by `toJSON()`. */
  static fromSnapshot(snapshot: MoneySnapshot): Money {
    return Money.fromPersistence(snapshot.cents, snapshot.currency)
  }

  // ─── Arithmetic ──────────────────────────────────────────────────────────

  add(other: Money): Money {
    this.#assertSameCurrency(other, "add")
    return new Money(this.cents + other.cents, this.currency)
  }

  subtract(other: Money): Money {
    this.#assertSameCurrency(other, "subtract")
    return new Money(this.cents - other.cents, this.currency)
  }

  /**
   * Multiply by a scalar (quantity, percentage, etc.). Result is rounded
   * to the nearest integer cent (banker's rounding NOT used — Math.round
   * with .5 → .5+ rounds half-away-from-zero in JS, which matches most
   * accounting expectations for small amounts).
   */
  multiply(scalar: number): Money {
    if (typeof scalar !== "number" || !Number.isFinite(scalar)) {
      throw new InvalidValueObjectError(
        "Money",
        "scalar must be a finite number",
        scalar,
      )
    }
    return new Money(Math.round(this.cents * scalar), this.currency)
  }

  // ─── Comparison ──────────────────────────────────────────────────────────

  /** -1 if this < other, 0 if equal, 1 if this > other. Throws on mixed currency. */
  compare(other: Money): -1 | 0 | 1 {
    this.#assertSameCurrency(other, "compare")
    if (this.cents < other.cents) return -1
    if (this.cents > other.cents) return 1
    return 0
  }

  /** Value-equality. Null/undefined-safe. False on currency mismatch (no throw). */
  equals(other: Money | null | undefined): boolean {
    if (!other) return false
    return this.cents === other.cents && this.currency.equals(other.currency)
  }

  // ─── Predicates ──────────────────────────────────────────────────────────

  get isZero(): boolean { return this.cents === 0 }
  get isPositive(): boolean { return this.cents > 0 }
  get isNegative(): boolean { return this.cents < 0 }

  // ─── Conversions for display / persistence ──────────────────────────────

  toCents(): number {
    return this.cents
  }

  /**
   * Major units as a Number (e.g., 1000 cents → 10). For display only —
   * pass to `Intl.NumberFormat`. **Do NOT use for math** (floating-point
   * accumulates error); always do arithmetic in cents and convert to
   * major units only at the display boundary.
   */
  toMajorUnits(): number {
    return this.cents / 100
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #assertSameCurrency(other: Money, operation: string): void {
    if (!this.currency.equals(other.currency)) {
      throw new InvalidValueObjectError(
        "Money",
        `cannot ${operation} amounts in different currencies (${this.currency.value} vs ${other.currency.value})`,
        { left: this.currency.value, right: other.currency.value },
      )
    }
  }

  static #assertValidCents(cents: number): void {
    if (typeof cents !== "number" || !Number.isInteger(cents)) {
      throw new InvalidValueObjectError(
        "Money",
        "cents must be an integer (no fractional cents)",
        cents,
      )
    }
    if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
      throw new InvalidValueObjectError(
        "Money",
        `cents exceeds safe Number range (max ±${MAX_SAFE_CENTS})`,
        cents,
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  /** Debug-friendly string: "USD 1000" (cents, not major units). */
  toString(): string {
    return `${this.currency.value} ${this.cents}`
  }

  /** Structured snapshot. JSON.stringify(money) → {"cents":1000,"currency":"USD"}. */
  toJSON(): MoneySnapshot {
    return {
      cents: this.cents,
      currency: this.currency.value,
    }
  }
}
