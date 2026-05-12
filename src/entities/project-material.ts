import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import { MaterialTypeId } from "@/src/entities/value-objects/id"

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateProjectMaterialProps {
  materialTypeId: MaterialTypeId
  requiredQuantitySqm?: number | null
  allocatedQuantitySqm?: number
  notes?: string | null
}

export interface ProjectMaterialSnapshot {
  materialTypeId: string
  requiredQuantitySqm: number | null
  allocatedQuantitySqm: number
  notes: string | null
}

// ─── Value object ──────────────────────────────────────────────────────────

/**
 * Materials linked to a project, with required vs. allocated
 * quantity tracking. M:N junction between `projects` and
 * `material_types`, modeled as a value-object collection on
 * `Project`.
 *
 * NOT a separate entity:
 *   • No public ID. The DB row's `id` is a repo-internal detail; the
 *     identity here is `(projectId, materialTypeId)`.
 *   • Immutable after construction. Allocation changes produce a NEW
 *     instance via `withAllocation()` / `withRequired()` — the
 *     parent `Project` manages the collection swap and audit.
 *   • Schema-level cascade delete from the parent reflects this
 *     domain coupling.
 *
 * **Quantities are stored in m²** (matches `numeric(12,3)` columns).
 * `requiredQuantitySqm` is optional (rough estimate not always
 * known); `allocatedQuantitySqm` defaults to 0 and accumulates as
 * the project consumes the material.
 *
 * Source: project_materials table.
 */
export class ProjectMaterial {
  public readonly materialTypeId: MaterialTypeId
  public readonly requiredQuantitySqm: number | null
  public readonly allocatedQuantitySqm: number
  public readonly notes: string | null

  private constructor(
    materialTypeId: MaterialTypeId,
    requiredQuantitySqm: number | null,
    allocatedQuantitySqm: number,
    notes: string | null
  ) {
    this.materialTypeId = materialTypeId
    this.requiredQuantitySqm = requiredQuantitySqm
    this.allocatedQuantitySqm = allocatedQuantitySqm
    this.notes = notes
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateProjectMaterialProps): ProjectMaterial {
    const required = props.requiredQuantitySqm ?? null
    if (required !== null) {
      ProjectMaterial.#assertNonNegative(required, "requiredQuantitySqm")
    }
    const allocated = props.allocatedQuantitySqm ?? 0
    ProjectMaterial.#assertNonNegative(allocated, "allocatedQuantitySqm")

    const notes = trimOptional(props.notes, "notes", null, "ProjectMaterial")
    return new ProjectMaterial(props.materialTypeId, required, allocated, notes)
  }

  static fromSnapshot(s: ProjectMaterialSnapshot): ProjectMaterial {
    return new ProjectMaterial(
      MaterialTypeId.fromPersistence(s.materialTypeId),
      s.requiredQuantitySqm,
      s.allocatedQuantitySqm,
      s.notes
    )
  }

  // ─── Functional updates ─────────────────────────────────────────────────

  /**
   * Return a NEW instance with an absolute new allocated quantity.
   * The parent aggregate uses this to apply caller intent
   * ("allocate up to X"). For increments, use `withAdditionalAllocation`.
   */
  withAllocation(allocatedQuantitySqm: number): ProjectMaterial {
    ProjectMaterial.#assertNonNegative(allocatedQuantitySqm, "allocatedQuantitySqm")
    return new ProjectMaterial(
      this.materialTypeId,
      this.requiredQuantitySqm,
      allocatedQuantitySqm,
      this.notes
    )
  }

  /**
   * Increment `allocatedQuantitySqm` by `deltaSqm` (which may be
   * negative, e.g., to undo). Throws if the resulting value would
   * be negative.
   */
  withAdditionalAllocation(deltaSqm: number): ProjectMaterial {
    if (!Number.isFinite(deltaSqm)) {
      throw new InvalidEntityError("ProjectMaterial", "deltaSqm must be a finite number")
    }
    const next = this.allocatedQuantitySqm + deltaSqm
    if (next < 0) {
      throw new InvalidEntityError(
        "ProjectMaterial",
        `allocation cannot go negative (current ${this.allocatedQuantitySqm}, delta ${deltaSqm})`
      )
    }
    return new ProjectMaterial(this.materialTypeId, this.requiredQuantitySqm, next, this.notes)
  }

  withRequired(requiredQuantitySqm: number | null): ProjectMaterial {
    if (requiredQuantitySqm !== null) {
      ProjectMaterial.#assertNonNegative(requiredQuantitySqm, "requiredQuantitySqm")
    }
    return new ProjectMaterial(
      this.materialTypeId,
      requiredQuantitySqm,
      this.allocatedQuantitySqm,
      this.notes
    )
  }

  withNotes(notes: string | null): ProjectMaterial {
    const trimmed = trimOptional(notes, "notes", null, "ProjectMaterial")
    return new ProjectMaterial(
      this.materialTypeId,
      this.requiredQuantitySqm,
      this.allocatedQuantitySqm,
      trimmed
    )
  }

  // ─── Predicates ─────────────────────────────────────────────────────────

  /** True iff a required quantity is set and the allocation meets it. */
  get isFullyAllocated(): boolean {
    return (
      this.requiredQuantitySqm !== null && this.allocatedQuantitySqm >= this.requiredQuantitySqm
    )
  }

  // ─── Equality ────────────────────────────────────────────────────────────

  equals(other: ProjectMaterial | null | undefined): boolean {
    if (!other) return false
    return (
      this.materialTypeId.equals(other.materialTypeId) &&
      this.requiredQuantitySqm === other.requiredQuantitySqm &&
      this.allocatedQuantitySqm === other.allocatedQuantitySqm &&
      this.notes === other.notes
    )
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): ProjectMaterialSnapshot {
    return {
      materialTypeId: this.materialTypeId.value,
      requiredQuantitySqm: this.requiredQuantitySqm,
      allocatedQuantitySqm: this.allocatedQuantitySqm,
      notes: this.notes,
    }
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  static #assertNonNegative(value: number, field: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new InvalidEntityError(
        "ProjectMaterial",
        `${field} must be a non-negative finite number`
      )
    }
  }
}
