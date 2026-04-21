import { AreaError } from "./errors"
import { Length } from "./length"

const SQMM_PER_SQM = 1_000_000
const SQM_PER_SQFT = 0.09290304

export class Area {
  private constructor(public readonly sqmm: number) {}

  static fromSqmm(sqmm: number): Area {
    if (!Number.isFinite(sqmm)) throw new AreaError("sqmm must be finite")
    if (sqmm < 0) throw new AreaError("sqmm must be non-negative")
    return new Area(Math.round(sqmm))
  }

  static fromSqm(sqm: number): Area {
    if (!Number.isFinite(sqm)) throw new AreaError("sqm must be finite")
    if (sqm < 0) throw new AreaError("sqm must be non-negative")
    return new Area(Math.round(sqm * SQMM_PER_SQM))
  }

  static fromSqft(sqft: number): Area {
    if (!Number.isFinite(sqft)) throw new AreaError("sqft must be finite")
    if (sqft < 0) throw new AreaError("sqft must be non-negative")
    return new Area(Math.round(sqft * SQM_PER_SQFT * SQMM_PER_SQM))
  }

  static fromDimensions(width: Length, length: Length): Area {
    return Area.fromSqmm(width.mm * length.mm)
  }

  static zero(): Area {
    return new Area(0)
  }

  toSqm(): number {
    return this.sqmm / SQMM_PER_SQM
  }

  toSqft(): number {
    return this.toSqm() / SQM_PER_SQFT
  }

  add(other: Area): Area {
    return Area.fromSqmm(this.sqmm + other.sqmm)
  }

  subtract(other: Area): Area {
    return Area.fromSqmm(this.sqmm - other.sqmm)
  }

  multiply(scalar: number): Area {
    return Area.fromSqmm(this.sqmm * scalar)
  }

  equals(other: Area): boolean {
    return this.sqmm === other.sqmm
  }

  compareTo(other: Area): number {
    return this.sqmm - other.sqmm
  }

  isZero(): boolean {
    return this.sqmm === 0
  }
}
