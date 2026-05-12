import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Project } from "@/src/entities/project"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  CutHistoryId,
  MaterialTypeId,
  PersonId,
  ProfileId,
  ProjectId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const PROJECT_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PERSON_UUID = "00000000-0000-4000-8000-000000000080"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"
const OWNER_UUID_A = "00000000-0000-4000-8000-000000000100"
const OWNER_UUID_B = "00000000-0000-4000-8000-000000000101"
const MT_UUID_A = "00000000-0000-4000-8000-000000000020"
const MT_UUID_B = "00000000-0000-4000-8000-000000000021"
const CH_UUID_A = "00000000-0000-4000-8000-000000000050"
const CH_UUID_B = "00000000-0000-4000-8000-000000000051"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")
const T3 = new Date("2026-05-09T13:30:00.000Z")
const T4 = new Date("2026-05-09T14:00:00.000Z")

const USD = Currency.create("USD")
const ACTOR = ProfileId.fromPersistence(ACTOR_UUID)

function makeProject(overrides: Partial<Parameters<typeof Project.create>[0]> = {}) {
  return Project.create(
    {
      id: ProjectId.fromPersistence(PROJECT_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      name: "Hero showroom",
      ...overrides,
    },
    T0
  )
}

describe("Project", () => {
  describe("create()", () => {
    it("constructs with required fields and defaults to draft", () => {
      const p = makeProject()
      expect(p.id.value).toBe(PROJECT_UUID)
      expect(p.name).toBe("Hero showroom")
      expect(p.status).toBe("draft")
      expect(p.isDraft).toBe(true)
      expect(p.owners.length).toBe(0)
      expect(p.materials.length).toBe(0)
      expect(p.cutHistories.length).toBe(0)
      expect(p.budget).toBeNull()
    })

    it("trims name and rejects empty after trim", () => {
      expect(() => makeProject({ name: "   " })).toThrow(InvalidEntityError)
      const p = makeProject({ name: "  Lobby  " })
      expect(p.name).toBe("Lobby")
    })

    it("rejects endDate earlier than startDate", () => {
      expect(() => makeProject({ startDate: T2, endDate: T1 })).toThrow(InvalidEntityError)
    })

    it("rejects negative budget", () => {
      expect(() => makeProject({ budget: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
    })

    it("rejects duplicate owners on create", () => {
      expect(() =>
        makeProject({
          owners: [
            { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) },
            { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects duplicate materials on create", () => {
      expect(() =>
        makeProject({
          materials: [
            { materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A) },
            { materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A) },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects duplicate cutHistories on create", () => {
      expect(() =>
        makeProject({
          cutHistories: [
            { cutHistoryId: CutHistoryId.fromPersistence(CH_UUID_A) },
            { cutHistoryId: CutHistoryId.fromPersistence(CH_UUID_A) },
          ],
        })
      ).toThrow(InvalidEntityError)
    })

    it("preserves explicit collections", () => {
      const p = makeProject({
        owners: [{ ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) }],
        materials: [
          { materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A), requiredQuantitySqm: 5 },
        ],
        cutHistories: [{ cutHistoryId: CutHistoryId.fromPersistence(CH_UUID_A) }],
      })
      expect(p.owners.length).toBe(1)
      expect(p.materials.length).toBe(1)
      expect(p.materials[0]?.requiredQuantitySqm).toBe(5)
      expect(p.cutHistories.length).toBe(1)
    })
  })

  describe("updateDetails()", () => {
    it("updates fields and bumps audit", () => {
      const p = makeProject()
      p.updateDetails(
        {
          name: "Hero showroom — v2",
          description: "fresh brief",
          startDate: T1,
          endDate: T2,
          personId: PersonId.fromPersistence(PERSON_UUID),
          budget: Money.fromCents(50000, USD),
          notes: "n",
        },
        ACTOR,
        T1
      )
      expect(p.name).toBe("Hero showroom — v2")
      expect(p.description).toBe("fresh brief")
      expect(p.startDate).toEqual(T1)
      expect(p.endDate).toEqual(T2)
      expect(p.personId?.value).toBe(PERSON_UUID)
      expect(p.budget?.cents).toBe(50000)
      expect(p.updatedAt).toEqual(T1)
    })

    it("is a no-op when nothing changed", () => {
      const p = makeProject()
      const before = p.updatedAt
      p.updateDetails(
        {
          name: p.name,
          description: null,
          startDate: null,
          endDate: null,
          personId: null,
          budget: null,
          notes: null,
        },
        ACTOR,
        T1
      )
      expect(p.updatedAt).toBe(before)
    })

    it("rejects endDate before startDate", () => {
      const p = makeProject()
      expect(() =>
        p.updateDetails(
          {
            name: p.name,
            description: null,
            startDate: T2,
            endDate: T1,
            personId: null,
            budget: null,
            notes: null,
          },
          ACTOR,
          T3
        )
      ).toThrow(InvalidEntityError)
    })

    it("rejects after the project has been completed", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      expect(() =>
        p.updateDetails(
          {
            name: "new",
            description: null,
            startDate: null,
            endDate: null,
            personId: null,
            budget: null,
            notes: null,
          },
          ACTOR,
          T3
        )
      ).toThrow(InvalidEntityError)
    })
  })

  describe("start / complete / cancel", () => {
    it("start flips draft → active and stamps startDate", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      expect(p.status).toBe("active")
      expect(p.isActive).toBe(true)
      expect(p.startDate).toEqual(T1)
    })

    it("start does not override an existing startDate", () => {
      const p = makeProject({ startDate: T0 })
      p.start(ACTOR, T1)
      expect(p.startDate).toEqual(T0)
    })

    it("complete flips active → completed and stamps endDate", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      expect(p.status).toBe("completed")
      expect(p.isCompleted).toBe(true)
      expect(p.endDate).toEqual(T2)
    })

    it("complete rejects auto-stamping an endDate that is before startDate", () => {
      const p = makeProject({ startDate: T2 })
      p.start(ACTOR, T2)
      expect(() => p.complete(ACTOR, T1)).toThrow(InvalidEntityError)
    })

    it("cancel flips draft → cancelled", () => {
      const p = makeProject()
      p.cancel(ACTOR, T1)
      expect(p.status).toBe("cancelled")
      expect(p.isCancelled).toBe(true)
    })

    it("cancel from active is allowed", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.cancel(ACTOR, T2)
      expect(p.status).toBe("cancelled")
    })

    it("cancel rejected from completed", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      expect(() => p.cancel(ACTOR, T3)).toThrow(InvalidEntityError)
    })

    it("start rejected from completed", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      expect(() => p.start(ACTOR, T3)).toThrow(InvalidEntityError)
    })
  })

  describe("owner collection", () => {
    it("addOwner adds a new owner", () => {
      const p = makeProject()
      p.addOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T1)
      expect(p.owners.length).toBe(1)
      expect(p.owners[0]?.ownerProfileId.value).toBe(OWNER_UUID_A)
    })

    it("addOwner is idempotent — no-op for already-attached owner", () => {
      const p = makeProject()
      p.addOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T1)
      const before = p.updatedAt
      p.addOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T2)
      expect(p.owners.length).toBe(1)
      expect(p.updatedAt).toBe(before)
    })

    it("removeOwner removes an attached owner", () => {
      const p = makeProject({
        owners: [{ ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) }],
      })
      p.removeOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T1)
      expect(p.owners.length).toBe(0)
    })

    it("removeOwner is no-op for unknown owner", () => {
      const p = makeProject()
      const before = p.updatedAt
      p.removeOwner(ProfileId.fromPersistence(OWNER_UUID_B), ACTOR, T1)
      expect(p.updatedAt).toBe(before)
    })

    it("addOwner rejected in terminal status", () => {
      const p = makeProject()
      p.cancel(ACTOR, T1)
      expect(() => p.addOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })
  })

  describe("material collection", () => {
    it("addMaterial appends and removeMaterial removes", () => {
      const p = makeProject()
      p.addMaterial({ materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A) }, ACTOR, T1)
      expect(p.materials.length).toBe(1)
      p.removeMaterial(MaterialTypeId.fromPersistence(MT_UUID_A), ACTOR, T2)
      expect(p.materials.length).toBe(0)
    })

    it("addMaterial is idempotent", () => {
      const p = makeProject()
      p.addMaterial(
        { materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A), allocatedQuantitySqm: 5 },
        ACTOR,
        T1
      )
      const before = p.updatedAt
      p.addMaterial(
        { materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A), allocatedQuantitySqm: 9 },
        ACTOR,
        T2
      )
      expect(p.materials.length).toBe(1)
      expect(p.materials[0]?.allocatedQuantitySqm).toBe(5)
      expect(p.updatedAt).toBe(before)
    })

    it("allocateMaterial adds delta to existing material", () => {
      const p = makeProject({
        materials: [
          {
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A),
            requiredQuantitySqm: 10,
            allocatedQuantitySqm: 2,
          },
        ],
      })
      p.allocateMaterial(MaterialTypeId.fromPersistence(MT_UUID_A), 3, ACTOR, T1)
      expect(p.materials[0]?.allocatedQuantitySqm).toBe(5)
    })

    it("allocateMaterial throws when material is not attached", () => {
      const p = makeProject()
      expect(() =>
        p.allocateMaterial(MaterialTypeId.fromPersistence(MT_UUID_B), 1, ACTOR, T1)
      ).toThrow(InvalidEntityError)
    })

    it("allocateMaterial rejects a delta that would go negative", () => {
      const p = makeProject({
        materials: [{ materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A) }],
      })
      expect(() =>
        p.allocateMaterial(MaterialTypeId.fromPersistence(MT_UUID_A), -1, ACTOR, T1)
      ).toThrow(InvalidEntityError)
    })
  })

  describe("cut-history collection", () => {
    it("attachCutHistory adds and detachCutHistory removes", () => {
      const p = makeProject()
      p.attachCutHistory(CutHistoryId.fromPersistence(CH_UUID_A), ACTOR, T1)
      expect(p.cutHistories.length).toBe(1)
      p.detachCutHistory(CutHistoryId.fromPersistence(CH_UUID_A), ACTOR, T2)
      expect(p.cutHistories.length).toBe(0)
    })

    it("attachCutHistory is idempotent", () => {
      const p = makeProject()
      p.attachCutHistory(CutHistoryId.fromPersistence(CH_UUID_A), ACTOR, T1)
      const before = p.updatedAt
      p.attachCutHistory(CutHistoryId.fromPersistence(CH_UUID_A), ACTOR, T2)
      expect(p.cutHistories.length).toBe(1)
      expect(p.updatedAt).toBe(before)
    })

    it("attachCutHistory works post-completion (junctions are observational)", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      p.attachCutHistory(CutHistoryId.fromPersistence(CH_UUID_B), ACTOR, T3)
      expect(p.cutHistories.length).toBe(1)
    })

    it("rejects on soft-deleted project", () => {
      const p = makeProject()
      p.softDelete(ACTOR, T1)
      expect(() => p.attachCutHistory(CutHistoryId.fromPersistence(CH_UUID_A), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })
  })

  describe("softDelete is independent of status", () => {
    it("marks deletedAt and preserves status", () => {
      const p = makeProject()
      p.start(ACTOR, T1)
      p.softDelete(ACTOR, T2)
      expect(p.isDeleted).toBe(true)
      expect(p.status).toBe("active")
    })

    it("is idempotent", () => {
      const p = makeProject()
      p.softDelete(ACTOR, T1)
      p.softDelete(ACTOR, T2)
      expect(p.deletedAt).toEqual(T1)
    })

    it("blocks subsequent edits", () => {
      const p = makeProject()
      p.softDelete(ACTOR, T1)
      expect(() => p.addOwner(ProfileId.fromPersistence(OWNER_UUID_A), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
      expect(() => p.cancel(ACTOR, T2)).toThrow(InvalidEntityError)
    })
  })

  describe("collection getters return defensive copies", () => {
    it("mutating returned arrays does not affect the aggregate", () => {
      const p = makeProject({
        owners: [{ ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) }],
        materials: [{ materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A) }],
        cutHistories: [{ cutHistoryId: CutHistoryId.fromPersistence(CH_UUID_A) }],
      })
      const owners = p.owners as unknown as unknown[]
      owners.length = 0
      expect(p.owners.length).toBe(1)
      const mats = p.materials as unknown as unknown[]
      mats.length = 0
      expect(p.materials.length).toBe(1)
      const chs = p.cutHistories as unknown as unknown[]
      chs.length = 0
      expect(p.cutHistories.length).toBe(1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including all three collections", () => {
      const p = makeProject({
        startDate: T0,
        endDate: T4,
        personId: PersonId.fromPersistence(PERSON_UUID),
        budget: Money.fromCents(100000, USD),
        owners: [
          { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_A) },
          { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID_B) },
        ],
        materials: [
          {
            materialTypeId: MaterialTypeId.fromPersistence(MT_UUID_A),
            requiredQuantitySqm: 8,
            allocatedQuantitySqm: 3,
          },
        ],
        cutHistories: [{ cutHistoryId: CutHistoryId.fromPersistence(CH_UUID_A) }],
      })
      p.start(ACTOR, T1)
      p.complete(ACTOR, T2)
      const snap = p.toJSON()
      expect(Project.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
