import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const NAME_MAX = 200

// ─── Types ─────────────────────────────────────────────────────────────────

export type JobAssigneeRole = "lead" | "worker"

const JOB_ASSIGNEE_ROLES: readonly JobAssigneeRole[] = ["lead", "worker"] as const

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateJobAssigneeProps {
  name: string
  role: JobAssigneeRole
  notes?: string | null
}

export interface JobAssigneeSnapshot {
  name: string
  role: JobAssigneeRole
  notes: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * Shop-floor roster entry on a `Job`: one `lead` + N `worker`s.
 * Free-text `name` by design — most rubber-shop cutters don't have
 * portal accounts, so the DB schema does NOT FK to `profiles`.
 *
 * Lives as a value-object collection on `Job`. NOT a separate entity:
 *   • No public ID. Identity is the `(jobId, name)` tuple inside the
 *     aggregate; the parent `Job` enforces uniqueness on name and
 *     at-most-one `lead`.
 *   • Immutable after construction.
 *   • Schema-level cascade delete from the parent reflects this
 *     domain coupling.
 *
 * The DB enforces at-most-one `lead` per job via a partial unique
 * index (file 7). The aggregate root enforces the same invariant
 * before persistence to fail fast.
 *
 * Source: job_assignees table.
 */
export class JobAssignee {
  public readonly name: string
  public readonly role: JobAssigneeRole
  public readonly notes: string | null

  private constructor(name: string, role: JobAssigneeRole, notes: string | null) {
    this.name = name
    this.role = role
    this.notes = notes
  }

  static create(props: CreateJobAssigneeProps): JobAssignee {
    const name = trimRequired(props.name, "name", NAME_MAX, "JobAssignee")
    if (!JOB_ASSIGNEE_ROLES.includes(props.role)) {
      throw new InvalidEntityError(
        "JobAssignee",
        `role must be 'lead' or 'worker' (got '${String(props.role)}')`
      )
    }
    const notes = trimOptional(props.notes, "notes", null, "JobAssignee")
    return new JobAssignee(name, props.role, notes)
  }

  static fromSnapshot(s: JobAssigneeSnapshot): JobAssignee {
    return new JobAssignee(s.name, s.role, s.notes)
  }

  get isLead(): boolean {
    return this.role === "lead"
  }

  equals(other: JobAssignee | null | undefined): boolean {
    if (!other) return false
    return this.name === other.name && this.role === other.role && this.notes === other.notes
  }

  toJSON(): JobAssigneeSnapshot {
    return {
      name: this.name,
      role: this.role,
      notes: this.notes,
    }
  }
}
