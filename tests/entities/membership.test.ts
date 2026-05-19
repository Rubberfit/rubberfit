import { describe, expect, it } from "vitest"

import type { AppRole } from "@/src/application/permissions"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Membership } from "@/src/entities/membership"
import {
  MembershipId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"

const MEMBERSHIP_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PROFILE_UUID = "00000000-0000-4000-8000-000000000020"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeMembership(
  overrides: Partial<Parameters<typeof Membership.create>[0]> = {},
  now: Date = T0,
): Membership {
  return Membership.create(
    {
      id: MembershipId.fromPersistence(MEMBERSHIP_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      profileId: ProfileId.fromPersistence(PROFILE_UUID),
      roles: ["member"] as AppRole[],
      ...overrides,
    },
    now,
  )
}

describe("Membership", () => {
  describe("create()", () => {
    it("constructs with required fields", () => {
      const m = makeMembership()
      expect(m.id.value).toBe(MEMBERSHIP_UUID)
      expect(m.tenantId.value).toBe(TENANT_UUID)
      expect(m.profileId.value).toBe(PROFILE_UUID)
      expect(m.roles).toEqual(["member"])
      expect(m.createdAt).toEqual(T0)
      expect(m.updatedAt).toEqual(T0)
      expect(m.deletedAt).toBeNull()
    })

    it("rejects empty roles", () => {
      expect(() => makeMembership({ roles: [] })).toThrow(InvalidEntityError)
    })

    it("snapshots the roles array (mutating the input doesn't affect the entity)", () => {
      const roles: AppRole[] = ["member"]
      const m = makeMembership({ roles })
      roles.push("admin")
      expect(m.roles).toEqual(["member"])
    })
  })

  describe("hasRole / hasAnyRole", () => {
    it("hasRole: true when role is present", () => {
      const m = makeMembership({ roles: ["admin", "cutter"] })
      expect(m.hasRole("admin")).toBe(true)
      expect(m.hasRole("cutter")).toBe(true)
    })

    it("hasRole: false when role is absent", () => {
      const m = makeMembership({ roles: ["cutter"] })
      expect(m.hasRole("admin")).toBe(false)
    })

    it("hasAnyRole: true when at least one matches", () => {
      const m = makeMembership({ roles: ["cutter"] })
      expect(m.hasAnyRole(["admin", "cutter"])).toBe(true)
    })

    it("hasAnyRole: false when none match", () => {
      const m = makeMembership({ roles: ["viewer"] })
      expect(m.hasAnyRole(["admin", "supervisor"])).toBe(false)
    })

    it("hasAnyRole: false on empty required-list", () => {
      const m = makeMembership({ roles: ["admin"] })
      expect(m.hasAnyRole([])).toBe(false)
    })
  })

  describe("updateRoles()", () => {
    it("replaces the roles and bumps audit", () => {
      const m = makeMembership({ roles: ["member"] })
      m.updateRoles(
        ["admin", "supervisor"],
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(m.roles).toEqual(["admin", "supervisor"])
      expect(m.updatedAt).toEqual(T1)
      expect(m.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("is a no-op on set equality (different order, same set)", () => {
      const m = makeMembership({ roles: ["admin", "cutter"] })
      const before = m.updatedAt
      m.updateRoles(
        ["cutter", "admin"],
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(m.updatedAt).toBe(before)
      expect(m.updatedBy).toBeNull()
    })

    it("rejects empty roles", () => {
      const m = makeMembership()
      expect(() =>
        m.updateRoles([], ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("rejects update on a deleted membership", () => {
      const m = makeMembership()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        m.updateRoles(["admin"], ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("snapshots the roles array (mutating input doesn't leak in)", () => {
      const m = makeMembership({ roles: ["member"] })
      const newRoles: AppRole[] = ["admin", "cutter"]
      m.updateRoles(newRoles, ProfileId.fromPersistence(ACTOR_UUID), T1)
      newRoles.push("supervisor")
      expect(m.roles).toEqual(["admin", "cutter"])
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt and bumps audit", () => {
      const m = makeMembership()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(m.isDeleted).toBe(true)
      expect(m.deletedAt).toEqual(T1)
      expect(m.updatedAt).toEqual(T1)
      expect(m.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("is idempotent on second call", () => {
      const m = makeMembership()
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      m.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(m.deletedAt).toEqual(T1) // first call wins
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makeMembership({
        roles: ["admin", "supervisor"],
        invitedBy: ProfileId.fromPersistence(ACTOR_UUID),
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      original.updateRoles(
        ["admin"],
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = original.toJSON()
      const rehydrated = Membership.fromJSON(snapshot)
      expect(rehydrated.toJSON()).toEqual(snapshot)
    })

    it("snapshot fields are primitives", () => {
      const m = makeMembership({
        invitedBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      const s = m.toJSON()
      expect(typeof s.id).toBe("string")
      expect(typeof s.tenantId).toBe("string")
      expect(typeof s.profileId).toBe("string")
      expect(Array.isArray(s.roles)).toBe(true)
      expect(s.invitedBy).toBe(ACTOR_UUID)
    })

    it("snapshot's roles is a copy (mutating doesn't affect entity)", () => {
      const m = makeMembership({ roles: ["member"] })
      const s = m.toJSON()
      s.roles.push("admin")
      expect(m.roles).toEqual(["member"])
    })
  })
})
