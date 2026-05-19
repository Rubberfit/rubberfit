import { describe, expect, it } from "vitest"

import type { AppRole } from "@/src/application/permissions"
import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Invitation } from "@/src/entities/invitation"
import { Email } from "@/src/entities/value-objects/email"
import {
  InvitationId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

const INVITATION_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const INVITER_UUID = "00000000-0000-4000-8000-000000000020"
const VALID_TOKEN = "0123456789abcdef".repeat(4)

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")
const FUTURE = new Date("2026-05-16T12:00:00.000Z") // 1 week after T0
const PAST = new Date("2026-05-08T12:00:00.000Z") // 1 day before T0

function makeInvitation(
  overrides: Partial<Parameters<typeof Invitation.create>[0]> = {},
  now: Date = T0,
): Invitation {
  return Invitation.create(
    {
      id: InvitationId.fromPersistence(INVITATION_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      email: Email.create("invitee@example.com"),
      roles: ["member"] as AppRole[],
      token: InvitationToken.fromPersistence(VALID_TOKEN),
      expiresAt: FUTURE,
      invitedBy: ProfileId.fromPersistence(INVITER_UUID),
      ...overrides,
    },
    now,
  )
}

describe("Invitation", () => {
  describe("create()", () => {
    it("constructs with required fields and null terminal-state fields", () => {
      const inv = makeInvitation()
      expect(inv.id.value).toBe(INVITATION_UUID)
      expect(inv.tenantId.value).toBe(TENANT_UUID)
      expect(inv.email.value).toBe("invitee@example.com")
      expect(inv.roles).toEqual(["member"])
      expect(inv.token.value).toBe(VALID_TOKEN)
      expect(inv.expiresAt).toEqual(FUTURE)
      expect(inv.invitedBy?.value).toBe(INVITER_UUID)
      expect(inv.acceptedAt).toBeNull()
      expect(inv.revokedAt).toBeNull()
      expect(inv.lastSendAttemptAt).toBeNull()
      expect(inv.lastSendError).toBeNull()
      expect(inv.createdAt).toEqual(T0)
    })

    it("rejects empty roles", () => {
      expect(() => makeInvitation({ roles: [] })).toThrow(InvalidEntityError)
    })

    it("rejects expiresAt in the past", () => {
      expect(() => makeInvitation({ expiresAt: PAST })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects expiresAt equal to now", () => {
      expect(() => makeInvitation({ expiresAt: T0 }, T0)).toThrow(
        InvalidEntityError,
      )
    })
  })

  describe("state queries", () => {
    it("fresh invitation: isActive=true; not accepted/revoked/expired", () => {
      const inv = makeInvitation()
      expect(inv.isActive(T0)).toBe(true)
      expect(inv.isAccepted).toBe(false)
      expect(inv.isRevoked).toBe(false)
      expect(inv.hasTerminalState).toBe(false)
      expect(inv.isExpired(T0)).toBe(false)
    })

    it("expired invitation: isExpired=true, isActive=false", () => {
      const inv = makeInvitation()
      const afterExpiry = new Date(FUTURE.getTime() + 1000)
      expect(inv.isExpired(afterExpiry)).toBe(true)
      expect(inv.isActive(afterExpiry)).toBe(false)
    })

    it("accepted invitation: isActive=false, hasTerminalState=true", () => {
      const inv = makeInvitation()
      inv.markAccepted(T1)
      expect(inv.isAccepted).toBe(true)
      expect(inv.hasTerminalState).toBe(true)
      expect(inv.isActive(T1)).toBe(false)
    })

    it("revoked invitation: isActive=false, hasTerminalState=true", () => {
      const inv = makeInvitation()
      inv.revoke(T1)
      expect(inv.isRevoked).toBe(true)
      expect(inv.hasTerminalState).toBe(true)
      expect(inv.isActive(T1)).toBe(false)
    })
  })

  describe("markAccepted()", () => {
    it("sets acceptedAt", () => {
      const inv = makeInvitation()
      inv.markAccepted(T1)
      expect(inv.acceptedAt).toEqual(T1)
    })

    it("is idempotent (second call doesn't move acceptedAt)", () => {
      const inv = makeInvitation()
      inv.markAccepted(T1)
      inv.markAccepted(T2)
      expect(inv.acceptedAt).toEqual(T1)
    })

    it("throws if already revoked", () => {
      const inv = makeInvitation()
      inv.revoke(T1)
      expect(() => inv.markAccepted(T2)).toThrow(InvalidEntityError)
    })

    it("throws if expired", () => {
      const inv = makeInvitation()
      const afterExpiry = new Date(FUTURE.getTime() + 1000)
      expect(() => inv.markAccepted(afterExpiry)).toThrow(InvalidEntityError)
    })
  })

  describe("revoke()", () => {
    it("sets revokedAt", () => {
      const inv = makeInvitation()
      inv.revoke(T1)
      expect(inv.revokedAt).toEqual(T1)
    })

    it("is idempotent", () => {
      const inv = makeInvitation()
      inv.revoke(T1)
      inv.revoke(T2)
      expect(inv.revokedAt).toEqual(T1)
    })

    it("throws if already accepted", () => {
      const inv = makeInvitation()
      inv.markAccepted(T1)
      expect(() => inv.revoke(T2)).toThrow(InvalidEntityError)
    })
  })

  describe("recordSendSuccess() / recordSendFailure()", () => {
    it("recordSendSuccess updates lastSendAttemptAt and clears prior error", () => {
      const inv = makeInvitation()
      inv.recordSendFailure("SMTP timeout", T1)
      inv.recordSendSuccess(T2)
      expect(inv.lastSendAttemptAt).toEqual(T2)
      expect(inv.lastSendError).toBeNull()
    })

    it("recordSendFailure updates lastSendAttemptAt and stores error message", () => {
      const inv = makeInvitation()
      inv.recordSendFailure("SES rate-limited", T1)
      expect(inv.lastSendAttemptAt).toEqual(T1)
      expect(inv.lastSendError).toBe("SES rate-limited")
    })

    it("send tracking does NOT move createdAt or any terminal-state field", () => {
      const inv = makeInvitation()
      const createdBefore = inv.createdAt
      inv.recordSendFailure("err", T1)
      inv.recordSendSuccess(T2)
      expect(inv.createdAt).toEqual(createdBefore)
      expect(inv.acceptedAt).toBeNull()
      expect(inv.revokedAt).toBeNull()
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields with terminal state set", () => {
      const original = makeInvitation()
      original.recordSendFailure("transient error", T1)
      original.recordSendSuccess(T2)
      original.markAccepted(T2)
      const snapshot = original.toJSON()
      const rehydrated = Invitation.fromJSON(snapshot)
      expect(rehydrated.toJSON()).toEqual(snapshot)
    })

    it("snapshot has primitives only", () => {
      const inv = makeInvitation()
      const s = inv.toJSON()
      expect(typeof s.id).toBe("string")
      expect(typeof s.tenantId).toBe("string")
      expect(typeof s.email).toBe("string")
      expect(typeof s.token).toBe("string")
      expect(typeof s.expiresAt).toBe("string")
      expect(s.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(Array.isArray(s.roles)).toBe(true)
    })

    it("snapshot null fields are null (not undefined or missing)", () => {
      const inv = makeInvitation({ invitedBy: null })
      const s = inv.toJSON()
      expect(s.acceptedAt).toBeNull()
      expect(s.revokedAt).toBeNull()
      expect(s.lastSendAttemptAt).toBeNull()
      expect(s.lastSendError).toBeNull()
      expect(s.invitedBy).toBeNull()
    })
  })
})
