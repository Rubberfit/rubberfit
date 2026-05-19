import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Job } from "@/src/entities/job"
import { Email } from "@/src/entities/value-objects/email"
import {
  InvoiceId,
  JobId,
  MaterialTypeId,
  PersonId,
  ProfileId,
  ProjectId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"

const JOB_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PROJECT_UUID = "00000000-0000-4000-8000-000000000070"
const PERSON_UUID = "00000000-0000-4000-8000-000000000080"
const INVOICE_UUID = "00000000-0000-4000-8000-000000000090"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"
const MT_UUID_A = "00000000-0000-4000-8000-000000000020"
const MT_UUID_B = "00000000-0000-4000-8000-000000000021"
const ROLL_UUID_A = "00000000-0000-4000-8000-000000000200"
const ROLL_UUID_B = "00000000-0000-4000-8000-000000000201"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")
const T3 = new Date("2026-05-09T13:30:00.000Z")
const T4 = new Date("2026-05-09T14:00:00.000Z")

const ACTOR = ProfileId.fromPersistence(ACTOR_UUID)

function makeJob(overrides: Partial<Parameters<typeof Job.create>[0]> = {}) {
  return Job.create(
    {
      id: JobId.fromPersistence(JOB_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name: "Hero showroom — cut 1",
      customerName: "Acme Inc.",
      ...overrides,
    },
    T0
  )
}

describe("Job", () => {
  describe("create()", () => {
    it("constructs with required identifier + anchor, defaults to draft", () => {
      const j = makeJob()
      expect(j.id.value).toBe(JOB_UUID)
      expect(j.name).toBe("Hero showroom — cut 1")
      expect(j.customerName).toBe("Acme Inc.")
      expect(j.status).toBe("draft")
      expect(j.isDraft).toBe(true)
      expect(j.parts.length).toBe(0)
      expect(j.assignees.length).toBe(0)
      expect(j.rollAllocations.length).toBe(0)
    })

    it("accepts a project-anchored job with no customer fields", () => {
      const j = makeJob({
        customerName: null,
        projectId: ProjectId.fromPersistence(PROJECT_UUID),
      })
      expect(j.projectId?.value).toBe(PROJECT_UUID)
    })

    it("accepts a person-anchored job with no customer fields", () => {
      const j = makeJob({
        customerName: null,
        personId: PersonId.fromPersistence(PERSON_UUID),
      })
      expect(j.personId?.value).toBe(PERSON_UUID)
    })

    it("rejects when none of projectId / personId / customerName is set", () => {
      expect(() => makeJob({ customerName: null })).toThrow(InvalidEntityError)
    })

    it("rejects when none of name / description / jobNumber is set", () => {
      expect(() => makeJob({ name: null, description: null, jobNumber: null })).toThrow(
        InvalidEntityError
      )
    })

    it("accepts a job identified by description only", () => {
      const j = makeJob({ name: null, description: "Cleanup cut" })
      expect(j.name).toBeNull()
      expect(j.description).toBe("Cleanup cut")
    })

    it("accepts a job identified by jobNumber only (mapper-supplied)", () => {
      const j = makeJob({ name: null, description: null, jobNumber: "J-000001" })
      expect(j.jobNumber).toBe("J-000001")
    })

    it("rejects completedDate before startDate", () => {
      expect(() => makeJob({ startDate: T2, completedDate: T1 })).toThrow(InvalidEntityError)
    })

    it("rejects duplicate part lineNumbers on create", () => {
      expect(() =>
        makeJob({
          parts: [
            {
              lineNumber: 1,
              materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A),
              quantity: 1,
            },
            {
              lineNumber: 1,
              materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_B),
              quantity: 1,
            },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects duplicate assignee names on create", () => {
      expect(() =>
        makeJob({
          assignees: [
            { name: "Alex", role: "worker" },
            { name: "Alex", role: "lead" },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects two leads on create", () => {
      expect(() =>
        makeJob({
          assignees: [
            { name: "Alex", role: "lead" },
            { name: "Sam", role: "lead" },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects duplicate rollAllocations on create", () => {
      expect(() =>
        makeJob({
          rollAllocations: [
            { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 100 },
            { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 200 },
          ],
        })
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updateDetails()", () => {
    it("updates editable fields and bumps audit", () => {
      const j = makeJob()
      j.updateDetails(
        {
          projectId: ProjectId.fromPersistence(PROJECT_UUID),
          personId: null,
          invoiceId: InvoiceId.fromPersistence(INVOICE_UUID),
          name: "Hero showroom — cut 2",
          description: null,
          location: "Bay A",
          customerName: "Acme Inc.",
          customerEmail: Email.create("ops@acme.example"),
          customerPhone: "555-0100",
          customerPoNumber: "CUST-PO-1",
          startDate: T1,
          dueDate: T2,
          notes: "expedite",
        },
        ACTOR,
        T1
      )
      expect(j.projectId?.value).toBe(PROJECT_UUID)
      expect(j.invoiceId?.value).toBe(INVOICE_UUID)
      expect(j.location).toBe("Bay A")
      expect(j.customerEmail?.value).toBe("ops@acme.example")
      expect(j.dueDate).toEqual(T2)
      expect(j.updatedAt).toEqual(T1)
    })

    it("is a no-op when nothing changed", () => {
      const j = makeJob()
      const before = j.updatedAt
      j.updateDetails(
        {
          projectId: null,
          personId: null,
          invoiceId: null,
          name: j.name,
          description: null,
          location: null,
          customerName: j.customerName,
          customerEmail: null,
          customerPhone: null,
          customerPoNumber: null,
          startDate: null,
          dueDate: null,
          notes: null,
        },
        ACTOR,
        T1
      )
      expect(j.updatedAt).toBe(before)
    })

    it("rejects an update that would clear all anchors", () => {
      const j = makeJob()
      expect(() =>
        j.updateDetails(
          {
            projectId: null,
            personId: null,
            invoiceId: null,
            name: j.name,
            description: null,
            location: null,
            customerName: null,
            customerEmail: null,
            customerPhone: null,
            customerPoNumber: null,
            startDate: null,
            dueDate: null,
            notes: null,
          },
          ACTOR,
          T1
        )
      ).toThrow(InvalidEntityError)
    })

    it("rejects an update that would clear all identifiers", () => {
      const j = makeJob({ jobNumber: null })
      expect(() =>
        j.updateDetails(
          {
            projectId: null,
            personId: null,
            invoiceId: null,
            name: null,
            description: null,
            location: null,
            customerName: "Acme Inc.",
            customerEmail: null,
            customerPhone: null,
            customerPoNumber: null,
            startDate: null,
            dueDate: null,
            notes: null,
          },
          ACTOR,
          T1
        )
      ).toThrow(InvalidEntityError)
    })

    it("rejects after the job has been completed", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      j.complete(ACTOR, T3)
      expect(() =>
        j.updateDetails(
          {
            projectId: null,
            personId: null,
            invoiceId: null,
            name: "newer",
            description: null,
            location: null,
            customerName: j.customerName,
            customerEmail: null,
            customerPhone: null,
            customerPoNumber: null,
            startDate: null,
            dueDate: null,
            notes: null,
          },
          ACTOR,
          T4
        )
      ).toThrow(InvalidEntityError)
    })
  })

  describe("schedule / markInProgress / complete / cancel", () => {
    it("schedule flips draft → scheduled", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      expect(j.status).toBe("scheduled")
      expect(j.isScheduled).toBe(true)
    })

    it("markInProgress flips scheduled → in_progress and stamps startDate", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      expect(j.status).toBe("in_progress")
      expect(j.isInProgress).toBe(true)
      expect(j.startDate).toEqual(T2)
    })

    it("markInProgress does not override an existing startDate", () => {
      const j = makeJob({ startDate: T0 })
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      expect(j.startDate).toEqual(T0)
    })

    it("complete flips in_progress → completed and stamps completedDate", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      j.complete(ACTOR, T3)
      expect(j.status).toBe("completed")
      expect(j.isCompleted).toBe(true)
      expect(j.completedDate).toEqual(T3)
    })

    it("complete rejects auto-stamping a completedDate that is before startDate", () => {
      const j = makeJob({ startDate: T2 })
      j.schedule(ACTOR, T2)
      j.markInProgress(ACTOR, T2)
      expect(() => j.complete(ACTOR, T1)).toThrow(InvalidEntityError)
    })

    it("cancel works from draft / scheduled / in_progress", () => {
      const j1 = makeJob()
      j1.cancel(ACTOR, T1)
      expect(j1.status).toBe("cancelled")

      const j2 = makeJob()
      j2.schedule(ACTOR, T1)
      j2.cancel(ACTOR, T2)
      expect(j2.status).toBe("cancelled")

      const j3 = makeJob()
      j3.schedule(ACTOR, T1)
      j3.markInProgress(ACTOR, T2)
      j3.cancel(ACTOR, T3)
      expect(j3.status).toBe("cancelled")
    })

    it("cancel rejected from completed", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      j.complete(ACTOR, T3)
      expect(() => j.cancel(ACTOR, T4)).toThrow(InvalidEntityError)
    })
  })

  describe("parts collection", () => {
    function part(lineNumber: number, materialUuid = MT_UUID_A) {
      return {
        lineNumber,
        materialTypeId: MaterialTypeId.fromPersistence(materialUuid),
        quantity: 1,
      }
    }

    it("replaceParts replaces and sorts by lineNumber", () => {
      const j = makeJob()
      j.replaceParts([part(2, MT_UUID_B), part(1)], ACTOR, T1)
      expect(j.parts.map((p) => p.lineNumber)).toEqual([1, 2])
    })

    it("addPart appends and rejects duplicate lineNumber", () => {
      const j = makeJob()
      j.addPart(part(1), ACTOR, T1)
      expect(() => j.addPart(part(1, MT_UUID_B), ACTOR, T2)).toThrow(InvalidEntityError)
    })

    it("removePart removes an existing part; no-op for unknown", () => {
      const j = makeJob()
      j.addPart(part(1), ACTOR, T1)
      j.removePart(1, ACTOR, T2)
      expect(j.parts.length).toBe(0)
      const before = j.updatedAt
      j.removePart(99, ACTOR, T3)
      expect(j.updatedAt).toBe(before)
    })

    it("rejects mutations after the job is cancelled", () => {
      const j = makeJob()
      j.cancel(ACTOR, T1)
      expect(() => j.addPart(part(1), ACTOR, T2)).toThrow(InvalidEntityError)
      expect(() => j.replaceParts([part(1)], ACTOR, T2)).toThrow(InvalidEntityError)
    })
  })

  describe("assignees collection", () => {
    it("addAssignee adds a worker and lead returns the lead", () => {
      const j = makeJob()
      j.addAssignee({ name: "Alex", role: "worker" }, ACTOR, T1)
      j.addAssignee({ name: "Sam", role: "lead" }, ACTOR, T2)
      expect(j.assignees.length).toBe(2)
      expect(j.lead?.name).toBe("Sam")
    })

    it("rejects a duplicate assignee name", () => {
      const j = makeJob()
      j.addAssignee({ name: "Alex", role: "worker" }, ACTOR, T1)
      expect(() => j.addAssignee({ name: "Alex", role: "lead" }, ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })

    it("rejects adding a second lead", () => {
      const j = makeJob()
      j.addAssignee({ name: "Sam", role: "lead" }, ACTOR, T1)
      expect(() => j.addAssignee({ name: "Pat", role: "lead" }, ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })

    it("removeAssignee removes by name", () => {
      const j = makeJob()
      j.addAssignee({ name: "Alex", role: "worker" }, ACTOR, T1)
      j.removeAssignee("Alex", ACTOR, T2)
      expect(j.assignees.length).toBe(0)
    })

    it("rejects on cancelled job", () => {
      const j = makeJob()
      j.cancel(ACTOR, T1)
      expect(() => j.addAssignee({ name: "Alex", role: "worker" }, ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })
  })

  describe("rollAllocations collection", () => {
    it("addRollAllocation appends and rejects duplicate rollId", () => {
      const j = makeJob()
      j.addRollAllocation(
        { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 1500 },
        ACTOR,
        T1
      )
      expect(j.rollAllocations.length).toBe(1)
      expect(() =>
        j.addRollAllocation(
          { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 1000 },
          ACTOR,
          T2
        )
      ).toThrow(InvalidEntityError)
    })

    it("removeRollAllocation removes by rollId", () => {
      const j = makeJob()
      j.addRollAllocation(
        { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 1500 },
        ACTOR,
        T1
      )
      j.removeRollAllocation(RollId.fromPersistence(ROLL_UUID_A), ACTOR, T2)
      expect(j.rollAllocations.length).toBe(0)
    })

    it("rejects on completed job", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      j.complete(ACTOR, T3)
      expect(() =>
        j.addRollAllocation(
          { rollId: RollId.fromPersistence(ROLL_UUID_B), allocatedLengthMm: 500 },
          ACTOR,
          T4
        )
      ).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete is independent of status", () => {
    it("marks deletedAt and preserves status", () => {
      const j = makeJob()
      j.schedule(ACTOR, T1)
      j.softDelete(ACTOR, T2)
      expect(j.isDeleted).toBe(true)
      expect(j.status).toBe("scheduled")
    })

    it("is idempotent", () => {
      const j = makeJob()
      j.softDelete(ACTOR, T1)
      j.softDelete(ACTOR, T2)
      expect(j.deletedAt).toEqual(T1)
    })

    it("blocks subsequent mutators", () => {
      const j = makeJob()
      j.softDelete(ACTOR, T1)
      expect(() => j.schedule(ACTOR, T2)).toThrow(InvalidEntityError)
      expect(() => j.addAssignee({ name: "Alex", role: "worker" }, ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })
  })

  describe("collection getters return defensive copies", () => {
    it("mutating returned arrays does not affect the aggregate", () => {
      const j = makeJob({
        parts: [
          { lineNumber: 1, materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A), quantity: 1 },
        ],
        assignees: [{ name: "Alex", role: "worker" }],
        rollAllocations: [{ rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 1500 }],
      })
      ;(j.parts as unknown as unknown[]).length = 0
      ;(j.assignees as unknown as unknown[]).length = 0
      ;(j.rollAllocations as unknown as unknown[]).length = 0
      expect(j.parts.length).toBe(1)
      expect(j.assignees.length).toBe(1)
      expect(j.rollAllocations.length).toBe(1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including all three collections + audit", () => {
      const j = makeJob({
        jobNumber: "J-000123",
        projectId: ProjectId.fromPersistence(PROJECT_UUID),
        customerEmail: Email.create("ops@acme.example"),
        customerPhone: "555-0100",
        customerPoNumber: "CUST-PO-1",
        dueDate: T2,
        parts: [
          {
            lineNumber: 1,
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A),
            quantity: 4,
            widthMm: 1370,
            lengthMm: 2000,
          },
        ],
        assignees: [
          { name: "Sam", role: "lead" },
          { name: "Alex", role: "worker" },
        ],
        rollAllocations: [
          { rollId: RollId.fromPersistence(ROLL_UUID_A), allocatedLengthMm: 1500 },
          { rollId: RollId.fromPersistence(ROLL_UUID_B), allocatedLengthMm: 800 },
        ],
      })
      j.schedule(ACTOR, T1)
      j.markInProgress(ACTOR, T2)
      j.complete(ACTOR, T3)
      const snap = j.toJSON()
      expect(Job.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })

  describe("reconstitute() invariants", () => {
    it("rejects a snapshot with two leads", () => {
      const j = makeJob({
        assignees: [{ name: "Sam", role: "lead" }],
      })
      const snap = j.toJSON()
      snap.assignees.push({ name: "Pat", role: "lead", notes: null })
      expect(() => Job.fromJSON(snap)).toThrow(InvalidEntityError)
    })

    it("rejects a snapshot with no anchor", () => {
      const j = makeJob()
      const snap = j.toJSON()
      snap.customerName = null
      snap.projectId = null
      snap.personId = null
      expect(() => Job.fromJSON(snap)).toThrow(InvalidEntityError)
    })

    it("rejects a snapshot with no identifier", () => {
      const j = makeJob()
      const snap = j.toJSON()
      snap.name = null
      snap.description = null
      snap.jobNumber = null
      expect(() => Job.fromJSON(snap)).toThrow(InvalidEntityError)
    })
  })
})
