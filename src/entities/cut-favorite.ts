import {
  CutFavoriteId,
  CutHistoryId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateCutFavoriteProps {
  id: CutFavoriteId
  tenantId: TenantId
  userId: ProfileId
  cutHistoryId: CutHistoryId
  createdBy?: ProfileId | null
}

export interface ReconstituteCutFavoriteProps {
  id: CutFavoriteId
  tenantId: TenantId
  userId: ProfileId
  cutHistoryId: CutHistoryId
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface CutFavoriteSnapshot {
  id: string
  tenantId: string
  userId: string
  cutHistoryId: string
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Per-user bookmark of a `CutHistory` row. Lets operators flag cut
 * jobs they want to revisit (e.g., a particularly clean nesting pattern
 * worth reusing).
 *
 * UNIQUE on `(user_id, cut_history_id)` — one favorite per user per cut.
 *
 * No mutable fields beyond audit / soft-delete. The entity exposes only:
 *   • `create(props)`     — bookmark a cut
 *   • `softDelete(actor)` — un-bookmark (idempotent, terminal)
 *
 * **`user_id` vs `created_by`** — schema-level distinction preserved:
 *   • `userId`     — the operator whose favorite this is (immutable)
 *   • `createdBy`  — whoever wrote the row (typically the same person)
 *
 * **Cross-aggregate concern:** the schema's UNIQUE constraint is
 * unconditional (does not filter on `deleted_at IS NULL`). If a use-case
 * wants to support "re-favorite after un-favorite", the repository
 * needs to either hard-delete the prior row or look for a soft-deleted
 * row and undelete it. That logic belongs in the use-case, not here.
 *
 * Source: cut_favorites table.
 */
export class CutFavorite {
  #id: CutFavoriteId
  #tenantId: TenantId
  #userId: ProfileId
  #cutHistoryId: CutHistoryId
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteCutFavoriteProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#userId = props.userId
    this.#cutHistoryId = props.cutHistoryId
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(
    props: CreateCutFavoriteProps,
    now: Date = new Date(),
  ): CutFavorite {
    return new CutFavorite({
      id: props.id,
      tenantId: props.tenantId,
      userId: props.userId,
      cutHistoryId: props.cutHistoryId,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteCutFavoriteProps): CutFavorite {
    return new CutFavorite(props)
  }

  static fromJSON(s: CutFavoriteSnapshot): CutFavorite {
    return CutFavorite.reconstitute({
      id: CutFavoriteId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      userId: ProfileId.fromPersistence(s.userId),
      cutHistoryId: CutHistoryId.fromPersistence(s.cutHistoryId),
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): CutFavoriteId { return this.#id }
  get tenantId(): TenantId { return this.#tenantId }
  get userId(): ProfileId { return this.#userId }
  get cutHistoryId(): CutHistoryId { return this.#cutHistoryId }
  get createdAt(): Date { return this.#createdAt }
  get createdBy(): ProfileId | null { return this.#createdBy }
  get updatedAt(): Date { return this.#updatedAt }
  get updatedBy(): ProfileId | null { return this.#updatedBy }
  get deletedAt(): Date | null { return this.#deletedAt }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Un-bookmark. Idempotent; terminal. Existing references stay; row
   * stays in the table for historical reads.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): CutFavoriteSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      userId: this.#userId.value,
      cutHistoryId: this.#cutHistoryId.value,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
