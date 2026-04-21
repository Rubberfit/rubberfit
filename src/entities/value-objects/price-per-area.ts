import { PricePerAreaError } from "./errors"
import { Area } from "./area"
import { Money } from "./money"

const ISO_4217_PATTERN = /^[A-Z]{3}$/
const SQMM_PER_SQM = 1_000_000
const SQM_PER_SQFT = 0.09290304

export class PricePerArea {
  private constructor(
    public readonly centsPerSqm: number,
    public readonly currency: string
  ) {}

  static fromCentsPerSqm(centsPerSqm: number, currency: string): PricePerArea {
    if (!Number.isFinite(centsPerSqm)) {
      throw new PricePerAreaError("centsPerSqm must be finite")
    }
    if (centsPerSqm < 0) {
      throw new PricePerAreaError("centsPerSqm must be non-negative")
    }
    if (!ISO_4217_PATTERN.test(currency)) {
      throw new PricePerAreaError(`invalid currency: ${currency}`)
    }
    return new PricePerArea(Math.round(centsPerSqm), currency)
  }

  static fromDollarsPerSqm(dollars: number, currency: string): PricePerArea {
    return PricePerArea.fromCentsPerSqm(dollars * 100, currency)
  }

  static fromDollarsPerSqft(dollars: number, currency: string): PricePerArea {
    const dollarsPerSqm = dollars / SQM_PER_SQFT
    return PricePerArea.fromDollarsPerSqm(dollarsPerSqm, currency)
  }

  static zero(currency: string): PricePerArea {
    return PricePerArea.fromCentsPerSqm(0, currency)
  }

  toCentsPerSqft(): number {
    return this.centsPerSqm * SQM_PER_SQFT
  }

  toDollarsPerSqm(): number {
    return this.centsPerSqm / 100
  }

  toDollarsPerSqft(): number {
    return this.toCentsPerSqft() / 100
  }

  priceOf(area: Area): Money {
    const cents = Math.round((area.sqmm * this.centsPerSqm) / SQMM_PER_SQM)
    return Money.fromCents(cents, this.currency)
  }

  equals(other: PricePerArea): boolean {
    return (
      this.centsPerSqm === other.centsPerSqm && this.currency === other.currency
    )
  }

  isZero(): boolean {
    return this.centsPerSqm === 0
  }
}
