import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  ProjectCutHistory,
  type CreateProjectCutHistoryProps,
  type ProjectCutHistorySnapshot,
} from "@/src/entities/project-cut-history"
import {
  ProjectMaterial,
  type CreateProjectMaterialProps,
  type ProjectMaterialSnapshot,
} from "@/src/entities/project-material"
import {
  ProjectOwner,
  type CreateProjectOwnerProps,
  type ProjectOwnerSnapshot,
} from "@/src/entities/project-owner"
import { nullableEqual } from "@/src/entities/shared/equality"
import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"
import {
  CutHistoryId,
  MaterialTypeId,
  PersonId,
  ProfileId,
  ProjectId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"
import {
  assertProjectStatusTransition,
  isProjectStatus,
  type ProjectStatus,
} from "@/src/entities/value-objects/project-status"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const NAME_MAX = 200

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateProjectProps {
  id: ProjectId
  tenantId: TenantId
  name: string
  description?: string | null
  status?: ProjectStatus
  startDate?: Date | null
  endDate?: Date | null
  personId?: PersonId | null
  /**
   * Optional budget cap. The DB schema does NOT persist currency on
   * the projects row, so a budget Money VO carries its own currency
   * (typically tenant-default). When NULL there is no budget.
   */
  budget?: Money | null
  notes?: string | null
  owners?: CreateProjectOwnerProps[]
  materials?: CreateProjectMaterialProps[]
  cutHistories?: CreateProjectCutHistoryProps[]
  createdBy?: ProfileId | null
}

export interface ReconstituteProjectProps {
  id: ProjectId
  tenantId: TenantId
  name: string
  description: string | null
  status: ProjectStatus
  startDate: Date | null
  endDate: Date | null
  personId: PersonId | null
  budget: Money | null
  notes: string | null
  owners: ProjectOwner[]
  materials: ProjectMaterial[]
  cutHistories: ProjectCutHistory[]
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `Project.updateDetails`. Field-by-field
 * mirror of the editable header fields. Owners/materials/cut-history
 * junctions and status transitions have their own dedicated methods.
 */
export interface ProjectUpdateProps {
  name: string
  description: string | null
  startDate: Date | null
  endDate: Date | null
  personId: PersonId | null
  budget: Money | null
  notes: string | null
}

export interface ProjectSnapshot {
  id: string
  tenantId: string
  name: string
  description: string | null
  status: ProjectStatus
  startDate: string | null
  endDate: string | null
  personId: string | null
  budget: MoneySnapshot | null
  notes: string | null
  owners: ProjectOwnerSnapshot[]
  materials: ProjectMaterialSnapshot[]
  cutHistories: ProjectCutHistorySnapshot[]
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * A unit of work for a customer — fans out to jobs, cut-history
 * records, materials, and (optionally) an invoice. Aggregate root
 * owning three value-object collections:
 *   • `owners`        — `ProjectOwner[]`, M:N to profiles
 *   • `materials`     — `ProjectMaterial[]`, required vs allocated qty
 *   • `cutHistories`  — `ProjectCutHistory[]`, junctions to cut_history
 *
 * **Status machine** (from `value-objects/project-status.ts`):
 *   draft → active → completed       (happy path)
 *   * → cancelled                    (allowed from non-terminal)
 *
 * `start()` flips to active and stamps `startDate` if not set;
 * `complete()` flips to completed and stamps `endDate` if not set.
 *
 * **Date invariant.** `endDate >= startDate` (mirrors
 * `projects_valid_date_range` CHECK).
 *
 * **Budget.** Optional `Money | null`. The DB schema only persists
 * `budget_cents`, so the mapper supplies currency on reconstitute.
 * Tenant-default currency is the typical source.
 *
 * **Editable scope.** `updateDetails` works in `draft` or `active`.
 * Terminal states (`completed`, `cancelled`) lock header edits — the
 * remaining valid actions are `softDelete`.
 *
 * Source: projects + project_owners + project_materials +
 * project_cut_histories tables.
 */
export class Project {
  #id: ProjectId
  #tenantId: TenantId
  #name: string
  #description: string | null
  #status: ProjectStatus
  #startDate: Date | null
  #endDate: Date | null
  #personId: PersonId | null
  #budget: Money | null
  #notes: string | null
  #owners: ProjectOwner[]
  #materials: ProjectMaterial[]
  #cutHistories: ProjectCutHistory[]
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteProjectProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#name = props.name
    this.#description = props.description
    this.#status = props.status
    this.#startDate = props.startDate
    this.#endDate = props.endDate
    this.#personId = props.personId
    this.#budget = props.budget
    this.#notes = props.notes
    this.#owners = [...props.owners]
    this.#materials = [...props.materials]
    this.#cutHistories = [...props.cutHistories]
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateProjectProps, now: Date = new Date()): Project {
    const name = trimRequired(props.name, "name", NAME_MAX, "Project")
    const description = trimOptional(props.description, "description", null, "Project")
    const notes = trimOptional(props.notes, "notes", null, "Project")

    const status: ProjectStatus = props.status ?? "draft"
    if (!isProjectStatus(status)) {
      throw new InvalidEntityError("Project", `invalid status '${String(status)}'`)
    }

    Project.#assertDateRange(props.startDate ?? null, props.endDate ?? null)
    if (props.budget) {
      Project.#assertBudgetNonNegative(props.budget)
    }

    const owners = Project.#buildOwners(props.owners ?? [], now)
    const materials = Project.#buildMaterials(props.materials ?? [])
    const cutHistories = Project.#buildCutHistories(props.cutHistories ?? [], now)

    return new Project({
      id: props.id,
      tenantId: props.tenantId,
      name,
      description,
      status,
      startDate: props.startDate ?? null,
      endDate: props.endDate ?? null,
      personId: props.personId ?? null,
      budget: props.budget ?? null,
      notes,
      owners,
      materials,
      cutHistories,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteProjectProps): Project {
    Project.#assertReconstituteInvariants(props)
    return new Project(props)
  }

  static fromJSON(s: ProjectSnapshot): Project {
    return Project.reconstitute({
      id: ProjectId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      name: s.name,
      description: s.description,
      status: s.status,
      startDate: s.startDate ? new Date(s.startDate) : null,
      endDate: s.endDate ? new Date(s.endDate) : null,
      personId: s.personId ? PersonId.fromPersistence(s.personId) : null,
      budget: s.budget ? Money.fromSnapshot(s.budget) : null,
      notes: s.notes,
      owners: s.owners.map(ProjectOwner.fromSnapshot),
      materials: s.materials.map(ProjectMaterial.fromSnapshot),
      cutHistories: s.cutHistories.map(ProjectCutHistory.fromSnapshot),
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): ProjectId {
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
  get status(): ProjectStatus {
    return this.#status
  }
  get startDate(): Date | null {
    return this.#startDate
  }
  get endDate(): Date | null {
    return this.#endDate
  }
  get personId(): PersonId | null {
    return this.#personId
  }
  get budget(): Money | null {
    return this.#budget
  }
  get notes(): string | null {
    return this.#notes
  }
  /** Defensive copy — owners are owned by this entity. */
  get owners(): ReadonlyArray<ProjectOwner> {
    return [...this.#owners]
  }
  /** Defensive copy — materials are owned by this entity. */
  get materials(): ReadonlyArray<ProjectMaterial> {
    return [...this.#materials]
  }
  /** Defensive copy — cut-history junctions are owned by this entity. */
  get cutHistories(): ReadonlyArray<ProjectCutHistory> {
    return [...this.#cutHistories]
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
  get isDraft(): boolean {
    return this.#status === "draft"
  }
  get isActive(): boolean {
    return this.#status === "active"
  }
  get isCompleted(): boolean {
    return this.#status === "completed"
  }
  get isCancelled(): boolean {
    return this.#status === "cancelled"
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated bulk edit of header-level fields. Only valid in
   * `draft` or `active` — terminal states lock header edits.
   * No-op if every field is unchanged.
   */
  updateDetails(props: ProjectUpdateProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update details")
    this.#assertEditableStatus("update details")

    const newName = trimRequired(props.name, "name", NAME_MAX, "Project")
    const newDescription = trimOptional(props.description, "description", null, "Project")
    const newNotes = trimOptional(props.notes, "notes", null, "Project")
    Project.#assertDateRange(props.startDate, props.endDate)
    if (props.budget !== null) {
      Project.#assertBudgetNonNegative(props.budget)
    }

    if (
      newName === this.#name &&
      newDescription === this.#description &&
      Project.#sameDateOrNull(props.startDate, this.#startDate) &&
      Project.#sameDateOrNull(props.endDate, this.#endDate) &&
      nullableEqual(props.personId, this.#personId) &&
      nullableEqual(props.budget, this.#budget) &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#name = newName
    this.#description = newDescription
    this.#startDate = props.startDate
    this.#endDate = props.endDate
    this.#personId = props.personId
    this.#budget = props.budget
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /** Move from `draft` to `active`. Stamps `startDate` if not set. */
  start(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("start")
    assertProjectStatusTransition(this.#status, "active")
    this.#status = "active"
    if (this.#startDate === null) {
      this.#startDate = now
      Project.#assertDateRange(this.#startDate, this.#endDate)
    }
    this.#touchAudit(updatedBy, now)
  }

  /** Move from `active` to `completed`. Stamps `endDate` if not set. */
  complete(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("complete")
    assertProjectStatusTransition(this.#status, "completed")
    this.#status = "completed"
    if (this.#endDate === null) {
      this.#endDate = now
      Project.#assertDateRange(this.#startDate, this.#endDate)
    }
    this.#touchAudit(updatedBy, now)
  }

  /** Cancel from any non-terminal state. */
  cancel(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("cancel")
    assertProjectStatusTransition(this.#status, "cancelled")
    this.#status = "cancelled"
    this.#touchAudit(updatedBy, now)
  }

  // ─── Owner collection ────────────────────────────────────────────────────

  addOwner(ownerProfileId: ProfileId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("add owner")
    this.#assertEditableStatus("add owner")
    if (this.#owners.some((o) => o.ownerProfileId.equals(ownerProfileId))) {
      return
    }
    this.#owners.push(ProjectOwner.create({ ownerProfileId, assignedBy: updatedBy }, now))
    this.#touchAudit(updatedBy, now)
  }

  removeOwner(ownerProfileId: ProfileId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("remove owner")
    this.#assertEditableStatus("remove owner")
    const before = this.#owners.length
    this.#owners = this.#owners.filter((o) => !o.ownerProfileId.equals(ownerProfileId))
    if (this.#owners.length !== before) {
      this.#touchAudit(updatedBy, now)
    }
  }

  // ─── Material collection ─────────────────────────────────────────────────

  /**
   * Attach a material to the project with optional required quantity
   * and starting allocation. No-op if the material is already
   * attached.
   */
  addMaterial(
    props: CreateProjectMaterialProps,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("add material")
    this.#assertEditableStatus("add material")
    if (this.#materials.some((m) => m.materialTypeId.equals(props.materialTypeId))) {
      return
    }
    this.#materials.push(ProjectMaterial.create(props))
    this.#touchAudit(updatedBy, now)
  }

  removeMaterial(
    materialTypeId: MaterialTypeId,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("remove material")
    this.#assertEditableStatus("remove material")
    const before = this.#materials.length
    this.#materials = this.#materials.filter((m) => !m.materialTypeId.equals(materialTypeId))
    if (this.#materials.length !== before) {
      this.#touchAudit(updatedBy, now)
    }
  }

  /**
   * Add to the allocated quantity for a material. Throws if the
   * material isn't on this project or if the delta would push
   * allocation negative.
   */
  allocateMaterial(
    materialTypeId: MaterialTypeId,
    deltaSqm: number,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("allocate material")
    const idx = this.#materials.findIndex((m) => m.materialTypeId.equals(materialTypeId))
    if (idx < 0) {
      throw new InvalidEntityError(
        "Project",
        `material ${materialTypeId.value} is not attached to this project`
      )
    }
    const current = this.#materials[idx]
    if (!current) {
      throw new InvalidEntityError("Project", `internal: material slot ${idx} missing`)
    }
    this.#materials[idx] = current.withAdditionalAllocation(deltaSqm)
    this.#touchAudit(updatedBy, now)
  }

  // ─── Cut-history collection ──────────────────────────────────────────────

  attachCutHistory(cutHistoryId: CutHistoryId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("attach cut history")
    if (this.#cutHistories.some((h) => h.cutHistoryId.equals(cutHistoryId))) {
      return
    }
    this.#cutHistories.push(ProjectCutHistory.create({ cutHistoryId, linkedBy: updatedBy }, now))
    this.#touchAudit(updatedBy, now)
  }

  detachCutHistory(cutHistoryId: CutHistoryId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("detach cut history")
    const before = this.#cutHistories.length
    this.#cutHistories = this.#cutHistories.filter((h) => !h.cutHistoryId.equals(cutHistoryId))
    if (this.#cutHistories.length !== before) {
      this.#touchAudit(updatedBy, now)
    }
  }

  // ─── Soft delete ────────────────────────────────────────────────────────

  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Project", `cannot ${operation} on a soft-deleted project`)
    }
  }

  #assertEditableStatus(operation: string): void {
    if (this.#status !== "draft" && this.#status !== "active") {
      throw new InvalidEntityError(
        "Project",
        `cannot ${operation} on a project with status '${this.#status}'`
      )
    }
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  static #assertDateRange(startDate: Date | null, endDate: Date | null): void {
    if (startDate !== null && endDate !== null && endDate.getTime() < startDate.getTime()) {
      throw new InvalidEntityError("Project", "endDate cannot be before startDate")
    }
  }

  static #assertBudgetNonNegative(budget: Money): void {
    if (budget.cents < 0) {
      throw new InvalidEntityError("Project", "budget must be >= 0")
    }
  }

  static #sameDateOrNull(a: Date | null, b: Date | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.getTime() === b.getTime()
  }

  static #buildOwners(raws: CreateProjectOwnerProps[], now: Date): ProjectOwner[] {
    const seen = new Set<string>()
    const owners = raws.map((raw) => {
      const owner = ProjectOwner.create(raw, now)
      if (seen.has(owner.ownerProfileId.value)) {
        throw new InvalidEntityError("Project", `duplicate owner ${owner.ownerProfileId.value}`)
      }
      seen.add(owner.ownerProfileId.value)
      return owner
    })
    return owners
  }

  static #buildMaterials(raws: CreateProjectMaterialProps[]): ProjectMaterial[] {
    const seen = new Set<string>()
    const materials = raws.map((raw) => {
      const m = ProjectMaterial.create(raw)
      if (seen.has(m.materialTypeId.value)) {
        throw new InvalidEntityError("Project", `duplicate material ${m.materialTypeId.value}`)
      }
      seen.add(m.materialTypeId.value)
      return m
    })
    return materials
  }

  static #buildCutHistories(raws: CreateProjectCutHistoryProps[], now: Date): ProjectCutHistory[] {
    const seen = new Set<string>()
    const histories = raws.map((raw) => {
      const h = ProjectCutHistory.create(raw, now)
      if (seen.has(h.cutHistoryId.value)) {
        throw new InvalidEntityError("Project", `duplicate cutHistory ${h.cutHistoryId.value}`)
      }
      seen.add(h.cutHistoryId.value)
      return h
    })
    return histories
  }

  static #assertReconstituteInvariants(props: ReconstituteProjectProps): void {
    if (!isProjectStatus(props.status)) {
      throw new InvalidEntityError(
        "Project",
        `reconstitute: invalid status '${String(props.status)}'`
      )
    }
    Project.#assertDateRange(props.startDate, props.endDate)
    if (props.budget) {
      Project.#assertBudgetNonNegative(props.budget)
    }
    const ownerSeen = new Set<string>()
    for (const o of props.owners) {
      if (ownerSeen.has(o.ownerProfileId.value)) {
        throw new InvalidEntityError(
          "Project",
          `reconstitute: duplicate owner ${o.ownerProfileId.value}`
        )
      }
      ownerSeen.add(o.ownerProfileId.value)
    }
    const matSeen = new Set<string>()
    for (const m of props.materials) {
      if (matSeen.has(m.materialTypeId.value)) {
        throw new InvalidEntityError(
          "Project",
          `reconstitute: duplicate material ${m.materialTypeId.value}`
        )
      }
      matSeen.add(m.materialTypeId.value)
    }
    const chSeen = new Set<string>()
    for (const h of props.cutHistories) {
      if (chSeen.has(h.cutHistoryId.value)) {
        throw new InvalidEntityError(
          "Project",
          `reconstitute: duplicate cutHistory ${h.cutHistoryId.value}`
        )
      }
      chSeen.add(h.cutHistoryId.value)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): ProjectSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      name: this.#name,
      description: this.#description,
      status: this.#status,
      startDate: this.#startDate?.toISOString() ?? null,
      endDate: this.#endDate?.toISOString() ?? null,
      personId: this.#personId?.value ?? null,
      budget: this.#budget?.toJSON() ?? null,
      notes: this.#notes,
      owners: this.#owners.map((o) => o.toJSON()),
      materials: this.#materials.map((m) => m.toJSON()),
      cutHistories: this.#cutHistories.map((h) => h.toJSON()),
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
