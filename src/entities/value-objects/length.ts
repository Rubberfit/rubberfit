import { LengthError } from "./errors"

const MM_PER_INCH = 25.4

export class Length {
  private constructor(public readonly mm: number) {}

  static fromMm(mm: number): Length {
    if (!Number.isFinite(mm)) throw new LengthError("mm must be finite")
    if (mm < 0) throw new LengthError("mm must be non-negative")
    return new Length(Math.round(mm))
  }

  static fromInches(inches: number): Length {
    if (!Number.isFinite(inches)) throw new LengthError("inches must be finite")
    if (inches < 0) throw new LengthError("inches must be non-negative")
    return new Length(Math.round(inches * MM_PER_INCH))
  }

  static zero(): Length {
    return new Length(0)
  }

  toInches(): number {
    return this.mm / MM_PER_INCH
  }

  add(other: Length): Length {
    return Length.fromMm(this.mm + other.mm)
  }

  subtract(other: Length): Length {
    return Length.fromMm(this.mm - other.mm)
  }

  multiply(scalar: number): Length {
    return Length.fromMm(this.mm * scalar)
  }

  equals(other: Length): boolean {
    return this.mm === other.mm
  }

  compareTo(other: Length): number {
    return this.mm - other.mm
  }

  isZero(): boolean {
    return this.mm === 0
  }
}
