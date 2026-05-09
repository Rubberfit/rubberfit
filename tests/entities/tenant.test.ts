import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Tenant } from "@/src/entities/tenant"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { TenantSlug } from "@/src/entities/value-objects/tenant-slug"

const TENANT_UUID = "550e8400-e29b-41d4-a716-446655440000"
const ACTOR_UUID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
const OTHER_ACTOR_UUID = "00000000-0000-4000-8000-000000000001"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")

function makeTenant(overrides: Partial<Parameters<typeof Tenant.create>[0]> = {}) {
  return Tenant.create(
    {
      id: TenantId.fromPersistence(TENANT_UUID),
      name: "Acme Corp",
      slug: TenantSlug.create("acme-corp"),
      ...overrides,
    },
    T0,
  )
}

describe("Tenant", () => {
  describe("create()", () => {
    it("constructs with required fields and sensible defaults", () => {
      const t = makeTenant()
      expect(t.id.value).toBe(TENANT_UUID)
      expect(t.name).toBe("Acme Corp")
      expect(t.slug.value).toBe("acme-corp")
      expect(t.status).toBe("active")
      expect(t.logoUrl).toBeNull()
      expect(t.trialEndsAt).toBeNull()
      expect(t.billingEmail).toBeNull()
      expect(t.stripeCustomerId).toBeNull()
      expect(t.deletedAt).toBeNull()
      expect(t.updatedBy).toBeNull()
    })

    it("seeds createdAt and updatedAt to the supplied `now`", () => {
      const t = makeTenant()
      expect(t.createdAt).toEqual(T0)
      expect(t.updatedAt).toEqual(T0)
    })

    it("trims the name", () => {
      const t = makeTenant({ name: "  Acme  " })
      expect(t.name).toBe("Acme")
    })

    it("rejects an empty name", () => {
      expect(() => makeTenant({ name: "   " })).toThrow(InvalidEntityError)
    })

    it("rejects a name longer than 200 characters", () => {
      expect(() => makeTenant({ name: "x".repeat(201) })).toThrow(
        InvalidEntityError,
      )
    })

    it("rejects status='trial' without trialEndsAt", () => {
      expect(() =>
        makeTenant({ status: "trial", trialEndsAt: null }),
      ).toThrow(InvalidEntityError)
    })

    it("accepts status='trial' with trialEndsAt", () => {
      const t = makeTenant({
        status: "trial",
        trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      expect(t.status).toBe("trial")
      expect(t.trialEndsAt).toEqual(new Date("2026-06-01T00:00:00.000Z"))
    })
  })

  describe("state queries", () => {
    it("active tenant: isActive=true, isSuspended=false, isDeleted=false", () => {
      const t = makeTenant()
      expect(t.isActive).toBe(true)
      expect(t.isSuspended).toBe(false)
      expect(t.isDeleted).toBe(false)
    })

    it("trial tenant: isActive=true (per the comment: 'members can sign in')", () => {
      const t = makeTenant({
        status: "trial",
        trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      expect(t.isActive).toBe(true)
    })

    it("suspended tenant: isSuspended=true, isActive=false", () => {
      const t = makeTenant()
      t.suspend(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.isActive).toBe(false)
      expect(t.isSuspended).toBe(true)
    })

    it("deleted tenant: isDeleted=true, isActive=false", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.isDeleted).toBe(true)
      expect(t.isActive).toBe(false)
    })

    it("isInActiveTrial: true while trial period hasn't elapsed", () => {
      const t = makeTenant({
        status: "trial",
        trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      expect(t.isInActiveTrial(new Date("2026-05-15T00:00:00.000Z"))).toBe(true)
    })

    it("isInActiveTrial: false after trial expires", () => {
      const t = makeTenant({
        status: "trial",
        trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      expect(t.isInActiveTrial(new Date("2026-07-01T00:00:00.000Z"))).toBe(false)
    })

    it("isInActiveTrial: false for non-trial tenants", () => {
      const t = makeTenant()
      expect(t.isInActiveTrial(T0)).toBe(false)
    })
  })

  describe("rename()", () => {
    it("updates name and bumps audit", () => {
      const t = makeTenant()
      t.rename("Acme Industries", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.name).toBe("Acme Industries")
      expect(t.updatedAt).toEqual(T1)
      expect(t.updatedBy?.value).toBe(ACTOR_UUID)
    })

    it("trims the new name", () => {
      const t = makeTenant()
      t.rename("  Acme Industries  ", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.name).toBe("Acme Industries")
    })

    it("is a no-op when the name is unchanged (no audit bump)", () => {
      const t = makeTenant()
      const beforeUpdatedAt = t.updatedAt
      t.rename("Acme Corp", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.updatedAt).toBe(beforeUpdatedAt)
      expect(t.updatedBy).toBeNull()
    })

    it("rejects empty name", () => {
      const t = makeTenant()
      expect(() =>
        t.rename("   ", ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("rejects rename on a deleted tenant", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        t.rename("Renamed", ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("changeBillingEmail()", () => {
    it("sets a new email and bumps audit", () => {
      const t = makeTenant()
      const email = Email.create("billing@acme.com")
      t.changeBillingEmail(email, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.billingEmail?.value).toBe("billing@acme.com")
      expect(t.updatedAt).toEqual(T1)
    })

    it("clears the email when null is passed", () => {
      const t = makeTenant({ billingEmail: Email.create("old@acme.com") })
      t.changeBillingEmail(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.billingEmail).toBeNull()
    })

    it("is a no-op when the new email equals the current one", () => {
      const t = makeTenant({ billingEmail: Email.create("a@b.com") })
      const beforeUpdatedAt = t.updatedAt
      t.changeBillingEmail(
        Email.create("a@b.com"),
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(t.updatedAt).toBe(beforeUpdatedAt)
    })

    it("is a no-op when both old and new are null", () => {
      const t = makeTenant() // billingEmail null
      const beforeUpdatedAt = t.updatedAt
      t.changeBillingEmail(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.updatedAt).toBe(beforeUpdatedAt)
    })
  })

  describe("changeLogoUrl() / linkStripeCustomer()", () => {
    it("changeLogoUrl: updates value and bumps audit", () => {
      const t = makeTenant()
      t.changeLogoUrl(
        "https://cdn.example.com/logo.png",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(t.logoUrl).toBe("https://cdn.example.com/logo.png")
      expect(t.updatedAt).toEqual(T1)
    })

    it("changeLogoUrl: no-op on equality", () => {
      const t = makeTenant({ logoUrl: "https://cdn.example.com/logo.png" })
      const before = t.updatedAt
      t.changeLogoUrl(
        "https://cdn.example.com/logo.png",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(t.updatedAt).toBe(before)
    })

    it("linkStripeCustomer: stores the id", () => {
      const t = makeTenant()
      t.linkStripeCustomer(
        "cus_ABC123",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(t.stripeCustomerId).toBe("cus_ABC123")
    })

    it("linkStripeCustomer: null clears the link", () => {
      const t = makeTenant({ stripeCustomerId: "cus_ABC123" })
      t.linkStripeCustomer(null, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.stripeCustomerId).toBeNull()
    })
  })

  describe("suspend() / reactivate()", () => {
    it("suspend: active → suspended", () => {
      const t = makeTenant()
      t.suspend(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.status).toBe("suspended")
      expect(t.updatedAt).toEqual(T1)
    })

    it("suspend: idempotent if already suspended (no audit bump on second call)", () => {
      const t = makeTenant()
      t.suspend(ProfileId.fromPersistence(ACTOR_UUID), T1)
      t.suspend(ProfileId.fromPersistence(OTHER_ACTOR_UUID), T2)
      expect(t.updatedAt).toEqual(T1)
      expect(t.updatedBy?.value).toBe(ACTOR_UUID) // first actor wins
    })

    it("reactivate: suspended → active", () => {
      const t = makeTenant()
      t.suspend(ProfileId.fromPersistence(ACTOR_UUID), T1)
      t.reactivate(ProfileId.fromPersistence(OTHER_ACTOR_UUID), T2)
      expect(t.status).toBe("active")
      expect(t.updatedBy?.value).toBe(OTHER_ACTOR_UUID)
    })

    it("reactivate: idempotent if already active (no-op)", () => {
      const t = makeTenant()
      const before = t.updatedAt
      t.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.updatedAt).toBe(before)
    })

    it("reactivate: throws on trial → would-be-active transition", () => {
      const t = makeTenant({
        status: "trial",
        trialEndsAt: new Date("2026-06-01T00:00:00.000Z"),
      })
      expect(() =>
        t.reactivate(ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("suspend: throws on a deleted tenant", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        t.suspend(ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete()", () => {
    it("sets status='cancelled' + deletedAt and bumps audit", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(t.status).toBe("cancelled")
      expect(t.deletedAt).toEqual(T1)
      expect(t.updatedAt).toEqual(T1)
      expect(t.isDeleted).toBe(true)
    })

    it("is idempotent — calling twice doesn't bump audit a second time", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      t.softDelete(ProfileId.fromPersistence(OTHER_ACTOR_UUID), T2)
      expect(t.deletedAt).toEqual(T1)
      expect(t.updatedBy?.value).toBe(ACTOR_UUID)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields after a round trip", () => {
      const original = makeTenant({
        logoUrl: "https://x.io/logo.png",
        billingEmail: Email.create("billing@acme.com"),
        stripeCustomerId: "cus_123",
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      original.rename("Acme Industries", ProfileId.fromPersistence(ACTOR_UUID), T1)

      const snapshot = original.toJSON()
      const rehydrated = Tenant.fromJSON(snapshot)

      expect(rehydrated.toJSON()).toEqual(snapshot)
    })

    it("snapshot fields are primitives (string IDs/email/slug, ISO dates)", () => {
      const t = makeTenant({
        billingEmail: Email.create("billing@acme.com"),
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      })
      const s = t.toJSON()
      expect(typeof s.id).toBe("string")
      expect(typeof s.slug).toBe("string")
      expect(typeof s.billingEmail).toBe("string")
      expect(typeof s.createdAt).toBe("string")
      expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it("snapshot serializes deleted state correctly", () => {
      const t = makeTenant()
      t.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      const s = t.toJSON()
      expect(s.status).toBe("cancelled")
      expect(s.deletedAt).toBe(T1.toISOString())
    })
  })
})
