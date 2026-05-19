import { describe, expect, it } from "vitest"

import { ProjectCutHistory } from "@/src/entities/project-cut-history"
import { CutHistoryId, ProfileId } from "@/src/entities/value-objects/id"

const CH_UUID = "00000000-0000-4000-8000-000000000050"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")

describe("ProjectCutHistory", () => {
  describe("create()", () => {
    it("stamps linkedAt from `now` when omitted", () => {
      const link = ProjectCutHistory.create(
        { cutHistoryId: CutHistoryId.fromPersistence(CH_UUID) },
        T0
      )
      expect(link.cutHistoryId.value).toBe(CH_UUID)
      expect(link.linkedAt).toEqual(T0)
      expect(link.linkedBy).toBeNull()
    })

    it("honours an explicit linkedAt and linkedBy", () => {
      const link = ProjectCutHistory.create(
        {
          cutHistoryId: CutHistoryId.fromPersistence(CH_UUID),
          linkedAt: T0,
          linkedBy: ProfileId.fromPersistence(ACTOR_UUID),
        },
        new Date("2099-01-01T00:00:00.000Z")
      )
      expect(link.linkedAt).toEqual(T0)
      expect(link.linkedBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("equals", () => {
    it("compares by cutHistoryId only", () => {
      const a = ProjectCutHistory.create(
        { cutHistoryId: CutHistoryId.fromPersistence(CH_UUID) },
        T0
      )
      const b = ProjectCutHistory.create(
        {
          cutHistoryId: CutHistoryId.fromPersistence(CH_UUID),
          linkedBy: ProfileId.fromPersistence(ACTOR_UUID),
        },
        new Date("2030-01-01T00:00:00.000Z")
      )
      expect(a.equals(b)).toBe(true)
      expect(a.equals(null)).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const link = ProjectCutHistory.create(
        {
          cutHistoryId: CutHistoryId.fromPersistence(CH_UUID),
          linkedBy: ProfileId.fromPersistence(ACTOR_UUID),
        },
        T0
      )
      const snap = link.toJSON()
      expect(ProjectCutHistory.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
