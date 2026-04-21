import { PercentageError } from "./errors"

export class Percentage {
  private constructor(public readonly fraction: number) {}

  static fromFraction(fraction: number): Percentage {
    if (!Number.isFinite(fraction)) {
      throw new PercentageError("fraction must be finite")
    }
    return new Percentage(fraction)
  }

  static fromPercent(percent: number): Percentage {
    if (!Number.isFinite(percent)) {
      throw new PercentageError("percent must be finite")
    }
    return new Percentage(percent / 100)
  }

  static zero(): Percentage {
    return new Percentage(0)
  }

  toFraction(): number {
    return this.fraction
  }

  toPercent(): number {
    return this.fraction * 100
  }

  clamp(min: number, max: number): Percentage {
    return Percentage.fromFraction(Math.min(Math.max(this.fraction, min), max))
  }

  equals(other: Percentage): boolean {
    return this.fraction === other.fraction
  }

  isZero(): boolean {
    return this.fraction === 0
  }
}
