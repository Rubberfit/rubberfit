import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import { RollId } from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateJobRollAllocationProps {
  rollId: RollId
  allocatedLengthMm: number
  notes?: string | null
}

export interface JobRollAllocationSnapshot {
  rollId: string
  allocatedLengthMm: number
  notes: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * Pre-allocation earmark on a `Job` — which inventory rolls (and
 * how much of each, in mm) are reserved to fulfil the job.
 * **Informational.** Does NOT decrement `rolls.remaining_length_mm`;
 * real consumption flows through `cut_history` + the cuts trigger
 * on the rolls table.
 *
 * Lives as a value-object collection on `Job`. NOT a separate entity:
 *   • No public ID. Identity = `(jobId, rollId)`.
 *   • Immutable after construction.
 *   • Schema-level cascade delete from the parent reflects this
 *     domain coupling.
 *
 * Source: job_roll_allocations table.
 */
export class JobRollAllocation {
  public readonly rollId: RollId
  public readonly allocatedLengthMm: number
  public readonly notes: string | null

  private constructor(rollId: RollId, allocatedLengthMm: number, notes: string | null) {
    this.rollId = rollId
    this.allocatedLengthMm = allocatedLengthMm
    this.notes = notes
  }

  static create(props: CreateJobRollAllocationProps): JobRollAllocation {
    if (!Number.isInteger(props.allocatedLengthMm) || props.allocatedLengthMm <= 0) {
      throw new InvalidEntityError(
        "JobRollAllocation",
        "allocatedLengthMm must be a positive integer"
      )
    }
    const notes = trimOptional(props.notes, "notes", null, "JobRollAllocation")
    return new JobRollAllocation(props.rollId, props.allocatedLengthMm, notes)
  }

  static fromSnapshot(s: JobRollAllocationSnapshot): JobRollAllocation {
    return new JobRollAllocation(RollId.fromPersistence(s.rollId), s.allocatedLengthMm, s.notes)
  }

  equals(other: JobRollAllocation | null | undefined): boolean {
    if (!other) return false
    return (
      this.rollId.equals(other.rollId) &&
      this.allocatedLengthMm === other.allocatedLengthMm &&
      this.notes === other.notes
    )
  }

  toJSON(): JobRollAllocationSnapshot {
    return {
      rollId: this.rollId.value,
      allocatedLengthMm: this.allocatedLengthMm,
      notes: this.notes,
    }
  }
}
