import { ProfileId } from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateProjectOwnerProps {
  ownerProfileId: ProfileId
  assignedAt?: Date
  assignedBy?: ProfileId | null
}

export interface ProjectOwnerSnapshot {
  ownerProfileId: string
  assignedAt: string
  assignedBy: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * A single profile that owns a project. M:N junction between
 * `projects` and `profiles`, modeled as a value-object collection on
 * `Project`.
 *
 * NOT a separate entity:
 *   • No public ID. The DB row's `id` is a repo-internal detail; the
 *     identity here is `(projectId, ownerProfileId)`.
 *   • Immutable after construction.
 *   • Schema-level cascade delete from the parent reflects this domain
 *     coupling.
 *
 * `assignedAt` mirrors `created_at`; `assignedBy` mirrors `created_by`
 * — they document who added the ownership link and when.
 *
 * Source: project_owners table.
 */
export class ProjectOwner {
  public readonly ownerProfileId: ProfileId
  public readonly assignedAt: Date
  public readonly assignedBy: ProfileId | null

  private constructor(ownerProfileId: ProfileId, assignedAt: Date, assignedBy: ProfileId | null) {
    this.ownerProfileId = ownerProfileId
    this.assignedAt = assignedAt
    this.assignedBy = assignedBy
  }

  static create(props: CreateProjectOwnerProps, now: Date = new Date()): ProjectOwner {
    return new ProjectOwner(props.ownerProfileId, props.assignedAt ?? now, props.assignedBy ?? null)
  }

  static fromSnapshot(s: ProjectOwnerSnapshot): ProjectOwner {
    return new ProjectOwner(
      ProfileId.fromPersistence(s.ownerProfileId),
      new Date(s.assignedAt),
      s.assignedBy ? ProfileId.fromPersistence(s.assignedBy) : null
    )
  }

  equals(other: ProjectOwner | null | undefined): boolean {
    if (!other) return false
    return this.ownerProfileId.equals(other.ownerProfileId)
  }

  toJSON(): ProjectOwnerSnapshot {
    return {
      ownerProfileId: this.ownerProfileId.value,
      assignedAt: this.assignedAt.toISOString(),
      assignedBy: this.assignedBy?.value ?? null,
    }
  }
}
