import { describe, expect, it } from "vitest"

import { ProjectOwner } from "@/src/entities/project-owner"
import { ProfileId } from "@/src/entities/value-objects/id"

const OWNER_UUID = "00000000-0000-4000-8000-000000000100"
const ASSIGNER_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")

describe("ProjectOwner", () => {
  describe("create()", () => {
    it("stamps assignedAt from `now` when omitted", () => {
      const owner = ProjectOwner.create(
        { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID) },
        T0
      )
      expect(owner.ownerProfileId.value).toBe(OWNER_UUID)
      expect(owner.assignedAt).toEqual(T0)
      expect(owner.assignedBy).toBeNull()
    })

    it("honours an explicit assignedAt and assignedBy", () => {
      const owner = ProjectOwner.create(
        {
          ownerProfileId: ProfileId.fromPersistence(OWNER_UUID),
          assignedAt: T0,
          assignedBy: ProfileId.fromPersistence(ASSIGNER_UUID),
        },
        new Date("2099-01-01T00:00:00.000Z")
      )
      expect(owner.assignedAt).toEqual(T0)
      expect(owner.assignedBy?.value).toBe(ASSIGNER_UUID)
    })
  })

  describe("equals()", () => {
    it("compares by ownerProfileId only", () => {
      const a = ProjectOwner.create(
        { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID), assignedBy: null },
        T0
      )
      const b = ProjectOwner.create(
        {
          ownerProfileId: ProfileId.fromPersistence(OWNER_UUID),
          assignedBy: ProfileId.fromPersistence(ASSIGNER_UUID),
          assignedAt: new Date("2030-01-01T00:00:00.000Z"),
        },
        T0
      )
      expect(a.equals(b)).toBe(true)
    })

    it("returns false for null / undefined", () => {
      const a = ProjectOwner.create({ ownerProfileId: ProfileId.fromPersistence(OWNER_UUID) }, T0)
      expect(a.equals(null)).toBe(false)
      expect(a.equals(undefined)).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const owner = ProjectOwner.create(
        {
          ownerProfileId: ProfileId.fromPersistence(OWNER_UUID),
          assignedBy: ProfileId.fromPersistence(ASSIGNER_UUID),
        },
        T0
      )
      const snap = owner.toJSON()
      expect(ProjectOwner.fromSnapshot(snap).toJSON()).toEqual(snap)
    })

    it("serializes timestamps as ISO strings", () => {
      const snap = ProjectOwner.create(
        { ownerProfileId: ProfileId.fromPersistence(OWNER_UUID) },
        T0
      ).toJSON()
      expect(typeof snap.assignedAt).toBe("string")
      expect(snap.assignedBy).toBeNull()
    })
  })
})
