import { CutHistoryId, ProfileId } from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateProjectCutHistoryProps {
  cutHistoryId: CutHistoryId
  linkedAt?: Date
  linkedBy?: ProfileId | null
}

export interface ProjectCutHistorySnapshot {
  cutHistoryId: string
  linkedAt: string
  linkedBy: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * Junction linking a cut-history record to a project. M:N (in
 * theory; UNIQUE (project_id, cut_history_id) makes a single
 * cut-history at-most-one project in practice). Modeled as a
 * value-object collection on `Project`.
 *
 * NOT a separate entity:
 *   • No public ID. The DB row's `id` is a repo-internal detail; the
 *     identity here is `(projectId, cutHistoryId)`.
 *   • Immutable after construction.
 *   • Schema-level cascade delete from the parent reflects this
 *     domain coupling.
 *
 * Source: project_cut_histories table.
 */
export class ProjectCutHistory {
  public readonly cutHistoryId: CutHistoryId
  public readonly linkedAt: Date
  public readonly linkedBy: ProfileId | null

  private constructor(cutHistoryId: CutHistoryId, linkedAt: Date, linkedBy: ProfileId | null) {
    this.cutHistoryId = cutHistoryId
    this.linkedAt = linkedAt
    this.linkedBy = linkedBy
  }

  static create(props: CreateProjectCutHistoryProps, now: Date = new Date()): ProjectCutHistory {
    return new ProjectCutHistory(props.cutHistoryId, props.linkedAt ?? now, props.linkedBy ?? null)
  }

  static fromSnapshot(s: ProjectCutHistorySnapshot): ProjectCutHistory {
    return new ProjectCutHistory(
      CutHistoryId.fromPersistence(s.cutHistoryId),
      new Date(s.linkedAt),
      s.linkedBy ? ProfileId.fromPersistence(s.linkedBy) : null
    )
  }

  equals(other: ProjectCutHistory | null | undefined): boolean {
    if (!other) return false
    return this.cutHistoryId.equals(other.cutHistoryId)
  }

  toJSON(): ProjectCutHistorySnapshot {
    return {
      cutHistoryId: this.cutHistoryId.value,
      linkedAt: this.linkedAt.toISOString(),
      linkedBy: this.linkedBy?.value ?? null,
    }
  }
}
