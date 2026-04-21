import { MoneyError } from "./errors"

const ISO_4217_PATTERN = /^[A-Z]{3}$/

export class Money {
  private constructor(
    public readonly cents: number,
    public readonly currency: string
  ) {}

  static fromCents(cents: number, currency: string): Money {
    if (!Number.isFinite(cents)) throw new MoneyError("cents must be finite")
    if (!Number.isInteger(cents)) throw new MoneyError("cents must be integer")
    if (!ISO_4217_PATTERN.test(currency)) {
      throw new MoneyError(`invalid currency: ${currency}`)
    }
    return new Money(cents, currency)
  }

  static fromDollars(dollars: number, currency: string): Money {
    if (!Number.isFinite(dollars)) throw new MoneyError("dollars must be finite")
    return Money.fromCents(Math.round(dollars * 100), currency)
  }

  static zero(currency: string): Money {
    return Money.fromCents(0, currency)
  }

  toDollars(): number {
    return this.cents / 100
  }

  add(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.fromCents(this.cents + other.cents, this.currency)
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other)
    return Money.fromCents(this.cents - other.cents, this.currency)
  }

  multiply(scalar: number): Money {
    return Money.fromCents(Math.round(this.cents * scalar), this.currency)
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency === other.currency
  }

  isZero(): boolean {
    return this.cents === 0
  }

  isNegative(): boolean {
    return this.cents < 0
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new MoneyError(
        `currency mismatch: ${this.currency} vs ${other.currency}`
      )
    }
  }
}
