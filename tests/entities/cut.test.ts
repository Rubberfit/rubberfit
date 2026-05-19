import { describe, expect, it } from "vitest"

import { Cut, type CutUpdateProps } from "@/src/entities/cut"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import {
  CutId,
  ProfileId,
  RollId,
  TenantId,
} from "@/src/entities/value-objects/id"

const CUT_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const ROLL_UUID = "00000000-0000-4000-8000-000000000020"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"
const OPERATOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeCut(overrides: Partial<Parameters<typeof Cut.create>[0]> = {}) {
  return Cut.create(
    {
      id: CutId.fromPersistence(CUT_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      rollId: RollId.fromPersistence(ROLL_UUID),
      cutWidthMm: 300,
      cutLengthMm: 600,
      ...overrides,
    },
    T0,
  )
}

const baseUpdate: CutUpdateProps = {
  quantity: 1,
  jobReference: null,
  cutBy: null,
  notes: null,
}

describe("Cut", () => {
  describe("create()", () => {
    it("constructs with required fields and defaults", () => {
      const c = makeCut()
      expect(c.id.value).toBe(CUT_UUID)
      expect(c.cutWidthMm).toBe(300)
      expect(c.cutLengthMm).toBe(600)
      expect(c.quantity).toBe(1)
      expect(c.wasteSqmm).toBeNull()
      expect(c.wastePercentage).toBeNull()
      expect(c.totalSqmmUsed).toBeNull()
      expect(c.deletedAt).toBeNull()
    })

    it("accepts engine output: waste fields populated at create", () => {
      const c = makeCut({
        wasteSqmm: 5000,
        wastePercentage: 12.5,
        totalSqmmUsed: 40000,
      })
      expect(c.wasteSqmm).toBe(5000)
      expect(c.wastePercentage).toBe(12.5)
      expect(c.totalSqmmUsed).toBe(40000)
    })

    it("rejects non-positive width / length", () => {
      expect(() => makeCut({ cutWidthMm: 0 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ cutLengthMm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ cutWidthMm: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects non-positive quantity", () => {
      expect(() => makeCut({ quantity: 0 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ quantity: -1 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ quantity: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects negative waste fields", () => {
      expect(() => makeCut({ wasteSqmm: -1 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ totalSqmmUsed: -1 })).toThrow(InvalidEntityError)
    })

    it("rejects non-integer waste / total areas", () => {
      expect(() => makeCut({ wasteSqmm: 1.5 })).toThrow(InvalidEntityError)
      expect(() => makeCut({ totalSqmmUsed: 1.5 })).toThrow(InvalidEntityError)
    })

    it("rejects wastePercentage out of [0,100]", () => {
      expect(() => makeCut({ wastePercentage: -1 })).toThrow(
        InvalidEntityError,
      )
      expect(() => makeCut({ wastePercentage: 101 })).toThrow(
        InvalidEntityError,
      )
    })

    it("trims jobReference / notes; rejects overlong jobReference", () => {
      const c = makeCut({ jobReference: "  Job 4521  ", notes: "  good  " })
      expect(c.jobReference).toBe("Job 4521")
      expect(c.notes).toBe("good")
      expect(() => makeCut({ jobReference: "x".repeat(101) })).toThrow(
        InvalidEntityError,
      )
    })

    it("captures cutBy + createdBy distinctly", () => {
      const c = makeCut({
        cutBy: ProfileId.fromPersistence(OPERATOR_UUID),
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      expect(c.cutBy?.value).toBe(OPERATOR_UUID)
      expect(c.createdBy?.value).toBe(ACTOR_UUID)
    })

    it("nullable rollId — orphaned cut is allowed", () => {
      const c = makeCut({ rollId: null })
      expect(c.rollId).toBeNull()
    })
  })

  describe("updateDetails()", () => {
    it("changes operator-editable fields and bumps audit", () => {
      const c = makeCut()
      c.updateDetails(
        {
          quantity: 5,
          jobReference: "Job 4521",
          cutBy: ProfileId.fromPersistence(OPERATOR_UUID),
          notes: "Bench cut",
        },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(c.quantity).toBe(5)
      expect(c.jobReference).toBe("Job 4521")
      expect(c.cutBy?.value).toBe(OPERATOR_UUID)
      expect(c.notes).toBe("Bench cut")
      expect(c.updatedAt).toEqual(T1)
    })

    it("does NOT touch waste fields, dimensions, or rollId", () => {
      const c = makeCut({
        wasteSqmm: 5000,
        wastePercentage: 12.5,
        totalSqmmUsed: 40000,
      })
      c.updateDetails(
        { ...baseUpdate, notes: "annotated" },
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(c.wasteSqmm).toBe(5000)
      expect(c.wastePercentage).toBe(12.5)
      expect(c.totalSqmmUsed).toBe(40000)
      expect(c.cutWidthMm).toBe(300)
      expect(c.rollId?.value).toBe(ROLL_UUID)
    })

    it("no-op on full equality", () => {
      const c = makeCut()
      const before = c.updatedAt
      c.updateDetails(
        baseUpdate,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(c.updatedAt).toBe(before)
    })

    it("rejects on a deleted cut", () => {
      const c = makeCut()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        c.updateDetails(
          baseUpdate,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("validation failure (overlong jobReference) leaves entity unchanged", () => {
      const c = makeCut()
      const before = c.toJSON()
      expect(() =>
        c.updateDetails(
          { ...baseUpdate, jobReference: "x".repeat(101) },
          ProfileId.fromPersistence(ACTOR_UUID),
          T1,
        ),
      ).toThrow(InvalidEntityError)
      expect(c.toJSON()).toEqual(before)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt + idempotent", () => {
      const c = makeCut()
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      c.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(c.deletedAt).toEqual(T1)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including engine output", () => {
      const c = makeCut({
        wasteSqmm: 5000,
        wastePercentage: 12.5,
        totalSqmmUsed: 40000,
        cutBy: ProfileId.fromPersistence(OPERATOR_UUID),
        jobReference: "Job 4521",
        notes: "important",
      })
      const snap = c.toJSON()
      expect(Cut.fromJSON(snap).toJSON()).toEqual(snap)
    })
  })
})
