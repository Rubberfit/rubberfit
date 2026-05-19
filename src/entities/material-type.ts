import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"
import { MaterialTypeId, ProfileId, TenantId } from "@/src/entities/value-objects/id"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const NAME_MAX = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateMaterialTypeProps {
  id: MaterialTypeId
  tenantId: TenantId
  name: string
  description?: string | null
  minStockSqm?: number | null
  createdBy?: ProfileId | null
}

export interface ReconstituteMaterialTypeProps {
  id: MaterialTypeId
  tenantId: TenantId
  name: string
  description: string | null
  minStockSqm: number | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

export interface MaterialTypeSnapshot {
  id: string
  tenantId: string
  name: string
  description: string | null
  minStockSqm: number | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * Tenant-scoped catalog of material categories (e.g., "Acrylic 3mm",
 * "Vinyl"). Pricing does NOT live here — it lives on material_suppliers,
 * because the same material may be sourced from multiple suppliers at
 * different costs.
 *
 * `minStockSqm` is the aggregate low-stock alert threshold: the sum of
 * (remaining_length_mm × width_mm) across all active rolls of this
 * material, expressed in square meters. NULL means "no alert configured".
 *
 * Lifecycle:
 *   create(props)           → new row; trims + length-validates name
 *   reconstitute(props)     → DB rehydration, no validation
 *   updateDetails(...)      → aggregated whole-record edit
 *   softDelete(...)         → terminal; existing FKs (rolls, reorder rules,
 *                             material_suppliers) keep their reference
 *
 * Cross-row uniqueness on (tenant_id, name) is enforced by the DB UNIQUE
 * constraint, surfaced as a service-layer error on conflict — not by this
 * entity (which can't see siblings).
 *
 * Source: material_types table.
 */
export class MaterialType {
  #id: MaterialTypeId
  #tenantId: TenantId
  #name: string
  #description: string | null
  #minStockSqm: number | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteMaterialTypeProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#name = props.name
    this.#description = props.description
    this.#minStockSqm = props.minStockSqm
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateMaterialTypeProps, now: Date = new Date()): MaterialType {
    const name = trimRequired(props.name, "name", NAME_MAX, "MaterialType")
    // description is unbounded text in the DB; pass max=null to skip length check
    const description = trimOptional(props.description, "description", null, "MaterialType")
    const minStockSqm = MaterialType.#normalizeMinStock(props.minStockSqm)

    return new MaterialType({
      id: props.id,
      tenantId: props.tenantId,
      name,
      description,
      minStockSqm,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteMaterialTypeProps): MaterialType {
    return new MaterialType(props)
  }

  static fromJSON(s: MaterialTypeSnapshot): MaterialType {
    return MaterialType.reconstitute({
      id: MaterialTypeId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      name: s.name,
      description: s.description,
      minStockSqm: s.minStockSqm,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): MaterialTypeId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get name(): string {
    return this.#name
  }
  get description(): string | null {
    return this.#description
  }
  get minStockSqm(): number | null {
    return this.#minStockSqm
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get createdBy(): ProfileId | null {
    return this.#createdBy
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }
  get updatedBy(): ProfileId | null {
    return this.#updatedBy
  }
  get deletedAt(): Date | null {
    return this.#deletedAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated whole-record edit. Material-type forms in the UI typically
   * save name + description + minStock together — folding them into one
   * method matches the form shape and gives one audit bump per save.
   * No-op if every field is unchanged.
   */
  updateDetails(
    name: string,
    description: string | null,
    minStockSqm: number | null,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("update details")
    const newName = trimRequired(name, "name", NAME_MAX, "MaterialType")
    const newDescription = trimOptional(description, "description", null, "MaterialType")
    const newMinStock = MaterialType.#normalizeMinStock(minStockSqm)

    if (
      newName === this.#name &&
      newDescription === this.#description &&
      newMinStock === this.#minStockSqm
    ) {
      return
    }

    this.#name = newName
    this.#description = newDescription
    this.#minStockSqm = newMinStock
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Soft-delete. Existing FKs (rolls, reorder rules, material_suppliers)
   * keep their reference — the row stays in the table for historical
   * reads. Idempotent.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /**
   * Normalize + validate min_stock_sqm. The DB CHECK is `>= 0`. We also
   * reject NaN / non-finite values. Treat undefined as null.
   */
  static #normalizeMinStock(value: number | null | undefined): number | null {
    if (value === null || value === undefined) return null
    if (!Number.isFinite(value)) {
      throw new InvalidEntityError("MaterialType", "minStockSqm must be a finite number")
    }
    if (value < 0) {
      throw new InvalidEntityError("MaterialType", "minStockSqm must be >= 0")
    }
    return value
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("MaterialType", `cannot ${operation} on a deleted material type`)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): MaterialTypeSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      name: this.#name,
      description: this.#description,
      minStockSqm: this.#minStockSqm,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
