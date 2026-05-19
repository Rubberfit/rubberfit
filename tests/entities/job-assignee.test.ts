import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { JobAssignee, type JobAssigneeRole } from "@/src/entities/job-assignee"

function makeAssignee(overrides: Partial<Parameters<typeof JobAssignee.create>[0]> = {}) {
  return JobAssignee.create({
    name: "Alex",
    role: "worker",
    ...overrides,
  })
}

describe("JobAssignee", () => {
  describe("create()", () => {
    it("constructs with required fields and isLead reflects role", () => {
      const worker = makeAssignee()
      expect(worker.name).toBe("Alex")
      expect(worker.role).toBe("worker")
      expect(worker.isLead).toBe(false)
      expect(worker.notes).toBeNull()

      const lead = makeAssignee({ role: "lead" })
      expect(lead.isLead).toBe(true)
    })

    it("trims name and rejects empty after trim", () => {
      expect(() => makeAssignee({ name: "   " })).toThrow(InvalidEntityError)
      expect(makeAssignee({ name: "  Sam  " }).name).toBe("Sam")
    })

    it("rejects an invalid role", () => {
      expect(() => makeAssignee({ role: "supervisor" as unknown as JobAssigneeRole })).toThrow(
        InvalidEntityError
      )
    })

    it("trims optional notes and accepts null", () => {
      expect(makeAssignee({ notes: "  back at 3pm  " }).notes).toBe("back at 3pm")
      expect(makeAssignee({ notes: null }).notes).toBeNull()
    })
  })

  describe("equals", () => {
    it("returns true for identical fields", () => {
      expect(makeAssignee().equals(makeAssignee())).toBe(true)
    })

    it("returns false for differing role", () => {
      expect(makeAssignee({ role: "worker" }).equals(makeAssignee({ role: "lead" }))).toBe(false)
    })

    it("returns false for null", () => {
      expect(makeAssignee().equals(null)).toBe(false)
    })
  })

  describe("fromSnapshot round-trip", () => {
    it("preserves all fields", () => {
      const a = makeAssignee({ role: "lead", notes: "lead today" })
      const snap = a.toJSON()
      expect(JobAssignee.fromSnapshot(snap).toJSON()).toEqual(snap)
    })
  })
})
