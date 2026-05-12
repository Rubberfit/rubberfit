import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  JobAssignee,
  type CreateJobAssigneeProps,
  type JobAssigneeSnapshot,
} from "@/src/entities/job-assignee"
import { JobPart, type CreateJobPartProps, type JobPartSnapshot } from "@/src/entities/job-part"
import {
  JobRollAllocation,
  type CreateJobRollAllocationProps,
  type JobRollAllocationSnapshot,
} from "@/src/entities/job-roll-allocation"
import { nullableEqual } from "@/src/entities/shared/equality"
import { trimOptional } from "@/src/entities/shared/string-helpers"
import { Email } from "@/src/entities/value-objects/email"
import {
  InvoiceId,
  JobId,
  PersonId,
  ProfileId,
  ProjectId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"
import {
  assertJobStatusTransition,
  isJobStatus,
  type JobStatus,
} from "@/src/entities/value-objects/job-status"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const JOB_NUMBER_MAX = 50
const NAME_MAX = 200
const LOCATION_MAX = 200
const CUSTOMER_PHONE_MAX = 50
const CUSTOMER_PO_NUMBER_MAX = 100

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateJobProps {
  id: JobId
  tenantId: TenantId
  projectId?: ProjectId | null
  personId?: PersonId | null
  invoiceId?: InvoiceId | null
  /**
   * Auto-assigned by a DB trigger (`J-000001`, …) so callers can
   * leave this null at create time; the mapper fills it in after
   * the row is inserted.
   */
  jobNumber?: string | null
  name?: string | null
  description?: string | null
  location?: string | null
  customerName?: string | null
  customerEmail?: Email | null
  customerPhone?: string | null
  customerPoNumber?: string | null
  status?: JobStatus
  startDate?: Date | null
  dueDate?: Date | null
  completedDate?: Date | null
  notes?: string | null
  parts?: CreateJobPartProps[]
  assignees?: CreateJobAssigneeProps[]
  rollAllocations?: CreateJobRollAllocationProps[]
  createdBy?: ProfileId | null
}

export interface ReconstituteJobProps {
  id: JobId
  tenantId: TenantId
  projectId: ProjectId | null
  personId: PersonId | null
  invoiceId: InvoiceId | null
  jobNumber: string | null
  name: string | null
  description: string | null
  location: string | null
  customerName: string | null
  customerEmail: Email | null
  customerPhone: string | null
  customerPoNumber: string | null
  status: JobStatus
  startDate: Date | null
  dueDate: Date | null
  completedDate: Date | null
  notes: string | null
  parts: JobPart[]
  assignees: JobAssignee[]
  rollAllocations: JobRollAllocation[]
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `Job.updateDetails`. Mirrors the editable
 * header fields. Status transitions, part/assignee/allocation
 * mutations, and soft-delete have their own dedicated methods.
 */
export interface JobUpdateProps {
  projectId: ProjectId | null
  personId: PersonId | null
  invoiceId: InvoiceId | null
  name: string | null
  description: string | null
  location: string | null
  customerName: string | null
  customerEmail: Email | null
  customerPhone: string | null
  customerPoNumber: string | null
  startDate: Date | null
  dueDate: Date | null
  notes: string | null
}

export interface JobSnapshot {
  id: string
  tenantId: string
  projectId: string | null
  personId: string | null
  invoiceId: string | null
  jobNumber: string | null
  name: string | null
  description: string | null
  location: string | null
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerPoNumber: string | null
  status: JobStatus
  startDate: string | null
  dueDate: string | null
  completedDate: string | null
  notes: string | null
  parts: JobPartSnapshot[]
  assignees: JobAssigneeSnapshot[]
  rollAllocations: JobRollAllocationSnapshot[]
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * A shop-floor work order — the unit that drives the cutting-engine
 * "open this job" flow, customer-facing receipts, and shop-floor
 * sheets. Aggregate root owning three value-object collections:
 *   • `parts`            — `JobPart[]`, line items (material × dims × qty)
 *   • `assignees`        — `JobAssignee[]`, free-text roster (1 lead, N workers)
 *   • `rollAllocations`  — `JobRollAllocation[]`, informational earmarks
 *
 * **Hybrid anchoring** (`jobs_anchored` DB CHECK): at least one of
 * `projectId | personId | customerName` must be set. Supports
 * project-anchored jobs (111-style) and standalone jobs with inline
 * customer fields (dev-style).
 *
 * **Identifier requirement** (`jobs_has_identifier` DB CHECK): at
 * least one of `name | description | jobNumber` must be set. The
 * `jobNumber` is auto-assigned by a DB trigger; callers can leave
 * it null at `create` and the mapper fills it on the read-back.
 *
 * **Status machine** (from `value-objects/job-status.ts`):
 *   draft → scheduled → in_progress → completed       (happy path)
 *   * → cancelled                                     (from any non-terminal)
 *
 * `schedule()`, `markInProgress()`, `complete()`, and `cancel()`
 * are the four state-transition methods. `complete()` stamps
 * `completedDate` if not set. `completedDate >= startDate` is
 * entity-enforced.
 *
 * **Lead invariant.** At most one `JobAssignee` per job may carry
 * `role: 'lead'` — mirrors the partial unique index defined in
 * migration file 7. Enforced at every assignee mutation and on
 * reconstitute.
 *
 * **Editable scope.** `updateDetails` and the collection mutators
 * work in `draft`, `scheduled`, or `in_progress`. Terminal states
 * (`completed`, `cancelled`) lock all edits except `softDelete`.
 *
 * Source: jobs + job_parts + job_assignees + job_roll_allocations
 * tables.
 */
export class Job {
  #id: JobId
  #tenantId: TenantId
  #projectId: ProjectId | null
  #personId: PersonId | null
  #invoiceId: InvoiceId | null
  #jobNumber: string | null
  #name: string | null
  #description: string | null
  #location: string | null
  #customerName: string | null
  #customerEmail: Email | null
  #customerPhone: string | null
  #customerPoNumber: string | null
  #status: JobStatus
  #startDate: Date | null
  #dueDate: Date | null
  #completedDate: Date | null
  #notes: string | null
  #parts: JobPart[]
  #assignees: JobAssignee[]
  #rollAllocations: JobRollAllocation[]
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteJobProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#projectId = props.projectId
    this.#personId = props.personId
    this.#invoiceId = props.invoiceId
    this.#jobNumber = props.jobNumber
    this.#name = props.name
    this.#description = props.description
    this.#location = props.location
    this.#customerName = props.customerName
    this.#customerEmail = props.customerEmail
    this.#customerPhone = props.customerPhone
    this.#customerPoNumber = props.customerPoNumber
    this.#status = props.status
    this.#startDate = props.startDate
    this.#dueDate = props.dueDate
    this.#completedDate = props.completedDate
    this.#notes = props.notes
    this.#parts = [...props.parts]
    this.#assignees = [...props.assignees]
    this.#rollAllocations = [...props.rollAllocations]
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateJobProps, now: Date = new Date()): Job {
    const jobNumber = trimOptional(props.jobNumber, "jobNumber", JOB_NUMBER_MAX, "Job")
    const name = trimOptional(props.name, "name", NAME_MAX, "Job")
    const description = trimOptional(props.description, "description", null, "Job")
    const location = trimOptional(props.location, "location", LOCATION_MAX, "Job")
    const customerName = trimOptional(props.customerName, "customerName", NAME_MAX, "Job")
    const customerPhone = trimOptional(
      props.customerPhone,
      "customerPhone",
      CUSTOMER_PHONE_MAX,
      "Job"
    )
    const customerPoNumber = trimOptional(
      props.customerPoNumber,
      "customerPoNumber",
      CUSTOMER_PO_NUMBER_MAX,
      "Job"
    )
    const notes = trimOptional(props.notes, "notes", null, "Job")

    const status: JobStatus = props.status ?? "draft"
    if (!isJobStatus(status)) {
      throw new InvalidEntityError("Job", `invalid status '${String(status)}'`)
    }

    Job.#assertHasIdentifier(name, description, jobNumber)
    Job.#assertAnchored(props.projectId ?? null, props.personId ?? null, customerName)
    Job.#assertDateRange(props.startDate ?? null, props.completedDate ?? null)

    const parts = Job.#buildParts(props.parts ?? [])
    const assignees = Job.#buildAssignees(props.assignees ?? [])
    const rollAllocations = Job.#buildRollAllocations(props.rollAllocations ?? [])

    return new Job({
      id: props.id,
      tenantId: props.tenantId,
      projectId: props.projectId ?? null,
      personId: props.personId ?? null,
      invoiceId: props.invoiceId ?? null,
      jobNumber,
      name,
      description,
      location,
      customerName,
      customerEmail: props.customerEmail ?? null,
      customerPhone,
      customerPoNumber,
      status,
      startDate: props.startDate ?? null,
      dueDate: props.dueDate ?? null,
      completedDate: props.completedDate ?? null,
      notes,
      parts,
      assignees,
      rollAllocations,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteJobProps): Job {
    Job.#assertReconstituteInvariants(props)
    return new Job(props)
  }

  static fromJSON(s: JobSnapshot): Job {
    return Job.reconstitute({
      id: JobId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      projectId: s.projectId ? ProjectId.fromPersistence(s.projectId) : null,
      personId: s.personId ? PersonId.fromPersistence(s.personId) : null,
      invoiceId: s.invoiceId ? InvoiceId.fromPersistence(s.invoiceId) : null,
      jobNumber: s.jobNumber,
      name: s.name,
      description: s.description,
      location: s.location,
      customerName: s.customerName,
      customerEmail: s.customerEmail ? Email.fromPersistence(s.customerEmail) : null,
      customerPhone: s.customerPhone,
      customerPoNumber: s.customerPoNumber,
      status: s.status,
      startDate: s.startDate ? new Date(s.startDate) : null,
      dueDate: s.dueDate ? new Date(s.dueDate) : null,
      completedDate: s.completedDate ? new Date(s.completedDate) : null,
      notes: s.notes,
      parts: s.parts.map(JobPart.fromSnapshot),
      assignees: s.assignees.map(JobAssignee.fromSnapshot),
      rollAllocations: s.rollAllocations.map(JobRollAllocation.fromSnapshot),
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): JobId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get projectId(): ProjectId | null {
    return this.#projectId
  }
  get personId(): PersonId | null {
    return this.#personId
  }
  get invoiceId(): InvoiceId | null {
    return this.#invoiceId
  }
  get jobNumber(): string | null {
    return this.#jobNumber
  }
  get name(): string | null {
    return this.#name
  }
  get description(): string | null {
    return this.#description
  }
  get location(): string | null {
    return this.#location
  }
  get customerName(): string | null {
    return this.#customerName
  }
  get customerEmail(): Email | null {
    return this.#customerEmail
  }
  get customerPhone(): string | null {
    return this.#customerPhone
  }
  get customerPoNumber(): string | null {
    return this.#customerPoNumber
  }
  get status(): JobStatus {
    return this.#status
  }
  get startDate(): Date | null {
    return this.#startDate
  }
  get dueDate(): Date | null {
    return this.#dueDate
  }
  get completedDate(): Date | null {
    return this.#completedDate
  }
  get notes(): string | null {
    return this.#notes
  }
  get parts(): ReadonlyArray<JobPart> {
    return [...this.#parts]
  }
  get assignees(): ReadonlyArray<JobAssignee> {
    return [...this.#assignees]
  }
  get rollAllocations(): ReadonlyArray<JobRollAllocation> {
    return [...this.#rollAllocations]
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
  get isScheduled(): boolean {
    return this.#status === "scheduled"
  }
  get isInProgress(): boolean {
    return this.#status === "in_progress"
  }
  get isCompleted(): boolean {
    return this.#status === "completed"
  }
  get isCancelled(): boolean {
    return this.#status === "cancelled"
  }
  get lead(): JobAssignee | null {
    return this.#assignees.find((a) => a.isLead) ?? null
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated bulk edit of header-level fields. Only valid in
   * `draft`, `scheduled`, or `in_progress`. Re-checks the
   * `has_identifier` and `anchored` invariants after the edit.
   * No-op if every field is unchanged.
   */
  updateDetails(props: JobUpdateProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update details")
    this.#assertEditableStatus("update details")

    const newName = trimOptional(props.name, "name", NAME_MAX, "Job")
    const newDescription = trimOptional(props.description, "description", null, "Job")
    const newLocation = trimOptional(props.location, "location", LOCATION_MAX, "Job")
    const newCustomerName = trimOptional(props.customerName, "customerName", NAME_MAX, "Job")
    const newCustomerPhone = trimOptional(
      props.customerPhone,
      "customerPhone",
      CUSTOMER_PHONE_MAX,
      "Job"
    )
    const newCustomerPoNumber = trimOptional(
      props.customerPoNumber,
      "customerPoNumber",
      CUSTOMER_PO_NUMBER_MAX,
      "Job"
    )
    const newNotes = trimOptional(props.notes, "notes", null, "Job")

    Job.#assertHasIdentifier(newName, newDescription, this.#jobNumber)
    Job.#assertAnchored(props.projectId, props.personId, newCustomerName)
    Job.#assertDateRange(props.startDate, this.#completedDate)

    if (
      nullableEqual(props.projectId, this.#projectId) &&
      nullableEqual(props.personId, this.#personId) &&
      nullableEqual(props.invoiceId, this.#invoiceId) &&
      newName === this.#name &&
      newDescription === this.#description &&
      newLocation === this.#location &&
      newCustomerName === this.#customerName &&
      nullableEqual(props.customerEmail, this.#customerEmail) &&
      newCustomerPhone === this.#customerPhone &&
      newCustomerPoNumber === this.#customerPoNumber &&
      Job.#sameDateOrNull(props.startDate, this.#startDate) &&
      Job.#sameDateOrNull(props.dueDate, this.#dueDate) &&
      newNotes === this.#notes
    ) {
      return
    }

    this.#projectId = props.projectId
    this.#personId = props.personId
    this.#invoiceId = props.invoiceId
    this.#name = newName
    this.#description = newDescription
    this.#location = newLocation
    this.#customerName = newCustomerName
    this.#customerEmail = props.customerEmail
    this.#customerPhone = newCustomerPhone
    this.#customerPoNumber = newCustomerPoNumber
    this.#startDate = props.startDate
    this.#dueDate = props.dueDate
    this.#notes = newNotes
    this.#touchAudit(updatedBy, now)
  }

  /** draft → scheduled. */
  schedule(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("schedule")
    assertJobStatusTransition(this.#status, "scheduled")
    this.#status = "scheduled"
    this.#touchAudit(updatedBy, now)
  }

  /** scheduled → in_progress. Stamps `startDate` if not set. */
  markInProgress(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("mark in_progress")
    assertJobStatusTransition(this.#status, "in_progress")
    this.#status = "in_progress"
    if (this.#startDate === null) {
      this.#startDate = now
      Job.#assertDateRange(this.#startDate, this.#completedDate)
    }
    this.#touchAudit(updatedBy, now)
  }

  /** in_progress → completed. Stamps `completedDate` if not set. */
  complete(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("complete")
    assertJobStatusTransition(this.#status, "completed")
    this.#status = "completed"
    if (this.#completedDate === null) {
      this.#completedDate = now
      Job.#assertDateRange(this.#startDate, this.#completedDate)
    }
    this.#touchAudit(updatedBy, now)
  }

  /** Cancel from any non-terminal state. */
  cancel(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("cancel")
    assertJobStatusTransition(this.#status, "cancelled")
    this.#status = "cancelled"
    this.#touchAudit(updatedBy, now)
  }

  // ─── Part collection ─────────────────────────────────────────────────────

  /**
   * Replace the entire parts collection. Mirrors the
   * delete-and-reinsert repository pattern on save.
   */
  replaceParts(rawParts: CreateJobPartProps[], updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("replace parts")
    this.#assertEditableStatus("replace parts")
    this.#parts = Job.#buildParts(rawParts)
    this.#touchAudit(updatedBy, now)
  }

  addPart(props: CreateJobPartProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("add part")
    this.#assertEditableStatus("add part")
    const part = JobPart.create(props)
    if (this.#parts.some((p) => p.lineNumber === part.lineNumber)) {
      throw new InvalidEntityError("Job", `duplicate lineNumber ${part.lineNumber}`)
    }
    this.#parts.push(part)
    this.#parts.sort((a, b) => a.lineNumber - b.lineNumber)
    this.#touchAudit(updatedBy, now)
  }

  removePart(lineNumber: number, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("remove part")
    this.#assertEditableStatus("remove part")
    const before = this.#parts.length
    this.#parts = this.#parts.filter((p) => p.lineNumber !== lineNumber)
    if (this.#parts.length !== before) {
      this.#touchAudit(updatedBy, now)
    }
  }

  // ─── Assignee collection ────────────────────────────────────────────────

  addAssignee(props: CreateJobAssigneeProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("add assignee")
    this.#assertEditableStatus("add assignee")
    const assignee = JobAssignee.create(props)
    if (this.#assignees.some((a) => a.name === assignee.name)) {
      throw new InvalidEntityError("Job", `duplicate assignee name '${assignee.name}'`)
    }
    if (assignee.isLead && this.#assignees.some((a) => a.isLead)) {
      throw new InvalidEntityError("Job", "a job can have at most one 'lead' assignee")
    }
    this.#assignees.push(assignee)
    this.#touchAudit(updatedBy, now)
  }

  removeAssignee(name: string, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("remove assignee")
    this.#assertEditableStatus("remove assignee")
    const before = this.#assignees.length
    this.#assignees = this.#assignees.filter((a) => a.name !== name)
    if (this.#assignees.length !== before) {
      this.#touchAudit(updatedBy, now)
    }
  }

  // ─── Roll-allocation collection ──────────────────────────────────────────

  addRollAllocation(
    props: CreateJobRollAllocationProps,
    updatedBy: ProfileId,
    now: Date = new Date()
  ): void {
    this.#assertNotDeleted("add roll allocation")
    this.#assertEditableStatus("add roll allocation")
    const alloc = JobRollAllocation.create(props)
    if (this.#rollAllocations.some((a) => a.rollId.equals(alloc.rollId))) {
      throw new InvalidEntityError(
        "Job",
        `roll ${alloc.rollId.value} is already allocated to this job`
      )
    }
    this.#rollAllocations.push(alloc)
    this.#touchAudit(updatedBy, now)
  }

  removeRollAllocation(rollId: RollId, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("remove roll allocation")
    this.#assertEditableStatus("remove roll allocation")
    const before = this.#rollAllocations.length
    this.#rollAllocations = this.#rollAllocations.filter((a) => !a.rollId.equals(rollId))
    if (this.#rollAllocations.length !== before) {
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
      throw new InvalidEntityError("Job", `cannot ${operation} on a soft-deleted job`)
    }
  }

  #assertEditableStatus(operation: string): void {
    if (this.#status === "completed" || this.#status === "cancelled") {
      throw new InvalidEntityError(
        "Job",
        `cannot ${operation} on a job with status '${this.#status}'`
      )
    }
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  static #assertHasIdentifier(
    name: string | null,
    description: string | null,
    jobNumber: string | null
  ): void {
    if (name === null && description === null && jobNumber === null) {
      throw new InvalidEntityError(
        "Job",
        "at least one of name, description, or jobNumber must be set"
      )
    }
  }

  static #assertAnchored(
    projectId: ProjectId | null,
    personId: PersonId | null,
    customerName: string | null
  ): void {
    if (projectId === null && personId === null && customerName === null) {
      throw new InvalidEntityError(
        "Job",
        "at least one of projectId, personId, or customerName must be set"
      )
    }
  }

  static #assertDateRange(startDate: Date | null, completedDate: Date | null): void {
    if (
      startDate !== null &&
      completedDate !== null &&
      completedDate.getTime() < startDate.getTime()
    ) {
      throw new InvalidEntityError("Job", "completedDate cannot be before startDate")
    }
  }

  static #sameDateOrNull(a: Date | null, b: Date | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.getTime() === b.getTime()
  }

  static #buildParts(raws: CreateJobPartProps[]): JobPart[] {
    const seen = new Set<number>()
    const parts = raws.map((raw) => {
      const part = JobPart.create(raw)
      if (seen.has(part.lineNumber)) {
        throw new InvalidEntityError("Job", `duplicate lineNumber ${part.lineNumber}`)
      }
      seen.add(part.lineNumber)
      return part
    })
    parts.sort((a, b) => a.lineNumber - b.lineNumber)
    return parts
  }

  static #buildAssignees(raws: CreateJobAssigneeProps[]): JobAssignee[] {
    const seenNames = new Set<string>()
    let leadCount = 0
    const assignees = raws.map((raw) => {
      const a = JobAssignee.create(raw)
      if (seenNames.has(a.name)) {
        throw new InvalidEntityError("Job", `duplicate assignee name '${a.name}'`)
      }
      seenNames.add(a.name)
      if (a.isLead) leadCount += 1
      return a
    })
    if (leadCount > 1) {
      throw new InvalidEntityError("Job", "a job can have at most one 'lead' assignee")
    }
    return assignees
  }

  static #buildRollAllocations(raws: CreateJobRollAllocationProps[]): JobRollAllocation[] {
    const seen = new Set<string>()
    return raws.map((raw) => {
      const a = JobRollAllocation.create(raw)
      if (seen.has(a.rollId.value)) {
        throw new InvalidEntityError(
          "Job",
          `roll ${a.rollId.value} is already allocated to this job`
        )
      }
      seen.add(a.rollId.value)
      return a
    })
  }

  static #assertReconstituteInvariants(props: ReconstituteJobProps): void {
    if (!isJobStatus(props.status)) {
      throw new InvalidEntityError("Job", `reconstitute: invalid status '${String(props.status)}'`)
    }
    Job.#assertHasIdentifier(props.name, props.description, props.jobNumber)
    Job.#assertAnchored(props.projectId, props.personId, props.customerName)
    Job.#assertDateRange(props.startDate, props.completedDate)

    const partLines = new Set<number>()
    for (const p of props.parts) {
      if (partLines.has(p.lineNumber)) {
        throw new InvalidEntityError(
          "Job",
          `reconstitute: duplicate part lineNumber ${p.lineNumber}`
        )
      }
      partLines.add(p.lineNumber)
    }

    const assigneeNames = new Set<string>()
    let leadCount = 0
    for (const a of props.assignees) {
      if (assigneeNames.has(a.name)) {
        throw new InvalidEntityError("Job", `reconstitute: duplicate assignee '${a.name}'`)
      }
      assigneeNames.add(a.name)
      if (a.isLead) leadCount += 1
    }
    if (leadCount > 1) {
      throw new InvalidEntityError(
        "Job",
        "reconstitute: a job can have at most one 'lead' assignee"
      )
    }

    const rollSeen = new Set<string>()
    for (const r of props.rollAllocations) {
      if (rollSeen.has(r.rollId.value)) {
        throw new InvalidEntityError(
          "Job",
          `reconstitute: duplicate roll allocation ${r.rollId.value}`
        )
      }
      rollSeen.add(r.rollId.value)
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): JobSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      projectId: this.#projectId?.value ?? null,
      personId: this.#personId?.value ?? null,
      invoiceId: this.#invoiceId?.value ?? null,
      jobNumber: this.#jobNumber,
      name: this.#name,
      description: this.#description,
      location: this.#location,
      customerName: this.#customerName,
      customerEmail: this.#customerEmail?.value ?? null,
      customerPhone: this.#customerPhone,
      customerPoNumber: this.#customerPoNumber,
      status: this.#status,
      startDate: this.#startDate?.toISOString() ?? null,
      dueDate: this.#dueDate?.toISOString() ?? null,
      completedDate: this.#completedDate?.toISOString() ?? null,
      notes: this.#notes,
      parts: this.#parts.map((p) => p.toJSON()),
      assignees: this.#assignees.map((a) => a.toJSON()),
      rollAllocations: this.#rollAllocations.map((r) => r.toJSON()),
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
