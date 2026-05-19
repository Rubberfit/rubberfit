import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import { MaterialTypeId } from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const DESCRIPTION_MAX = 500

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateJobPartProps {
  lineNumber: number
  materialTypeId: MaterialTypeId
  description?: string | null
  widthMm?: number | null
  lengthMm?: number | null
  thicknessMm?: number | null
  quantity: number
  notes?: string | null
}

export interface JobPartSnapshot {
  lineNumber: number
  materialTypeId: string
  description: string | null
  widthMm: number | null
  lengthMm: number | null
  thicknessMm: number | null
  quantity: number
  notes: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * One line item on a `Job` — material × dimensions × quantity. Used
 * by the customer-facing receipt PDF, the job-sheet PDF, and the
 * cutting-engine "open this job" flow that loads parts into AutoNest.
 *
 * Lives as a value-object collection on `Job`. NOT a separate entity:
 *   • No public ID. Identity = `(jobId, lineNumber)`.
 *   • Immutable after construction.
 *   • Schema-level cascade delete from the parent reflects this
 *     domain coupling.
 *
 * **Dimensions are stored in mm** (metric storage convention); UI
 * converts to display units.
 *
 * Source: job_parts table.
 */
export class JobPart {
  public readonly lineNumber: number
  public readonly materialTypeId: MaterialTypeId
  public readonly description: string | null
  public readonly widthMm: number | null
  public readonly lengthMm: number | null
  public readonly thicknessMm: number | null
  public readonly quantity: number
  public readonly notes: string | null

  private constructor(props: {
    lineNumber: number
    materialTypeId: MaterialTypeId
    description: string | null
    widthMm: number | null
    lengthMm: number | null
    thicknessMm: number | null
    quantity: number
    notes: string | null
  }) {
    this.lineNumber = props.lineNumber
    this.materialTypeId = props.materialTypeId
    this.description = props.description
    this.widthMm = props.widthMm
    this.lengthMm = props.lengthMm
    this.thicknessMm = props.thicknessMm
    this.quantity = props.quantity
    this.notes = props.notes
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateJobPartProps): JobPart {
    JobPart.#assertPositiveInteger(props.lineNumber, "lineNumber")
    JobPart.#assertPositiveInteger(props.quantity, "quantity")

    if (props.widthMm !== null && props.widthMm !== undefined) {
      JobPart.#assertPositiveInteger(props.widthMm, "widthMm")
    }
    if (props.lengthMm !== null && props.lengthMm !== undefined) {
      JobPart.#assertPositiveInteger(props.lengthMm, "lengthMm")
    }
    if (props.thicknessMm !== null && props.thicknessMm !== undefined) {
      JobPart.#assertPositiveFinite(props.thicknessMm, "thicknessMm")
    }

    const description = trimOptional(props.description, "description", DESCRIPTION_MAX, "JobPart")
    const notes = trimOptional(props.notes, "notes", null, "JobPart")

    return new JobPart({
      lineNumber: props.lineNumber,
      materialTypeId: props.materialTypeId,
      description,
      widthMm: props.widthMm ?? null,
      lengthMm: props.lengthMm ?? null,
      thicknessMm: props.thicknessMm ?? null,
      quantity: props.quantity,
      notes,
    })
  }

  static fromSnapshot(s: JobPartSnapshot): JobPart {
    return new JobPart({
      lineNumber: s.lineNumber,
      materialTypeId: MaterialTypeId.fromPersistence(s.materialTypeId),
      description: s.description,
      widthMm: s.widthMm,
      lengthMm: s.lengthMm,
      thicknessMm: s.thicknessMm,
      quantity: s.quantity,
      notes: s.notes,
    })
  }

  // ─── Equality ────────────────────────────────────────────────────────────

  equals(other: JobPart | null | undefined): boolean {
    if (!other) return false
    return (
      this.lineNumber === other.lineNumber &&
      this.materialTypeId.equals(other.materialTypeId) &&
      this.description === other.description &&
      this.widthMm === other.widthMm &&
      this.lengthMm === other.lengthMm &&
      this.thicknessMm === other.thicknessMm &&
      this.quantity === other.quantity &&
      this.notes === other.notes
    )
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): JobPartSnapshot {
    return {
      lineNumber: this.lineNumber,
      materialTypeId: this.materialTypeId.value,
      description: this.description,
      widthMm: this.widthMm,
      lengthMm: this.lengthMm,
      thicknessMm: this.thicknessMm,
      quantity: this.quantity,
      notes: this.notes,
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #assertPositiveInteger(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
      throw new InvalidEntityError("JobPart", `${field} must be a positive integer`)
    }
  }

  static #assertPositiveFinite(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new InvalidEntityError("JobPart", `${field} must be greater than zero`)
    }
  }
}
