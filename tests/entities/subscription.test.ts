import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Subscription } from "@/src/entities/subscription"
import {
  PlanId,
  ProfileId,
  SubscriptionId,
  TenantId,
} from "@/src/entities/value-objects/id"

const SUB_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PLAN_UUID = "00000000-0000-4000-8000-000000000020"
const OTHER_PLAN_UUID = "00000000-0000-4000-8000-000000000021"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000030"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")
const FUTURE = new Date("2026-06-09T12:00:00.000Z")

function makeSub(
  overrides: Partial<Parameters<typeof Subscription.create>[0]> = {},
  now: Date = T0,
): Subscription {
  return Subscription.create(
    {
      id: SubscriptionId.fromPersistence(SUB_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      planId: PlanId.fromPersistence(PLAN_UUID),
      status: "trialing",
      ...overrides,
    },
    now,
  )
}

describe("Subscription", () => {
  describe("create()", () => {
    it("constructs with required fields", () => {
      const s = makeSub()
      expect(s.id.value).toBe(SUB_UUID)
      expect(s.tenantId.value).toBe(TENANT_UUID)
      expect(s.planId.value).toBe(PLAN_UUID)
      expect(s.status).toBe("trialing")
      expect(s.canceledAt).toBeNull()
      expect(s.cancelAt).toBeNull()
      expect(s.deletedAt).toBeNull()
    })

    it.each(["incomplete", "trialing", "active", "past_due", "unpaid"] as const)(
      "accepts initial status: %s",
      (status) => {
        expect(() => makeSub({ status })).not.toThrow()
      },
    )

    it("rejects status='canceled' at creation", () => {
      expect(() => makeSub({ status: "canceled" })).toThrow(InvalidEntityError)
    })

    it("rejects period end before start", () => {
      expect(() =>
        makeSub({
          currentPeriodStart: T1,
          currentPeriodEnd: T0,
        }),
      ).toThrow(InvalidEntityError)
    })

    it("accepts equal start and end", () => {
      expect(() =>
        makeSub({
          currentPeriodStart: T0,
          currentPeriodEnd: T0,
        }),
      ).not.toThrow()
    })
  })

  describe("state queries", () => {
    it("trialing or active: isActive=true", () => {
      expect(makeSub({ status: "trialing" }).isActive).toBe(true)
      expect(makeSub({ status: "active" }).isActive).toBe(true)
    })

    it("past_due/unpaid/incomplete: isPaymentBlocking=true, isActive=false", () => {
      for (const status of ["past_due", "unpaid", "incomplete"] as const) {
        const s = makeSub({ status })
        expect(s.isPaymentBlocking).toBe(true)
        expect(s.isActive).toBe(false)
      }
    })

    it("isInCurrentPeriod: true when now is within window", () => {
      const s = makeSub({
        currentPeriodStart: T0,
        currentPeriodEnd: T2,
      })
      expect(s.isInCurrentPeriod(T1)).toBe(true)
    })

    it("isInCurrentPeriod: false outside window", () => {
      const s = makeSub({
        currentPeriodStart: T0,
        currentPeriodEnd: T1,
      })
      expect(s.isInCurrentPeriod(T2)).toBe(false)
    })

    it("isInCurrentPeriod: false when no period set", () => {
      expect(makeSub().isInCurrentPeriod(T0)).toBe(false)
    })

    it("hasScheduledCancellation false when cancelAt null", () => {
      expect(makeSub().hasScheduledCancellation).toBe(false)
    })

    it("hasScheduledCancellation true after scheduleCancellation", () => {
      const s = makeSub()
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.hasScheduledCancellation).toBe(true)
    })

    it("hasScheduledCancellation false once status is canceled (even if cancelAt set)", () => {
      const s = makeSub({ cancelAt: FUTURE })
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.hasScheduledCancellation).toBe(false)
    })

    it("isCancellationDue true when cancelAt has passed", () => {
      const s = makeSub()
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T1)
      const afterScheduled = new Date(FUTURE.getTime() + 1000)
      expect(s.isCancellationDue(afterScheduled)).toBe(true)
    })
  })

  describe("setStatus()", () => {
    it("sets status; idempotent on same status", () => {
      const s = makeSub({ status: "trialing" })
      s.setStatus("active", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.status).toBe("active")
      expect(s.updatedAt).toEqual(T1)

      const before = s.updatedAt
      s.setStatus("active", ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.updatedAt).toBe(before)
    })

    it("setStatus('canceled') stamps canceledAt", () => {
      const s = makeSub({ status: "active" })
      s.setStatus("canceled", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.canceledAt).toEqual(T1)
    })

    it("refuses to leave canceled (terminal)", () => {
      const s = makeSub({ status: "active" })
      s.setStatus("canceled", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.setStatus("active", ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })

    it("permissive: allows any non-canceled transition", () => {
      const s = makeSub({ status: "incomplete" })
      // jump straight to unpaid (would be unusual, but allowed in minimal FSM)
      s.setStatus("unpaid", ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.status).toBe("unpaid")
    })

    it("refuses on a deleted subscription", () => {
      const s = makeSub()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.setStatus("active", ProfileId.fromPersistence(ACTOR_UUID), T2),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("cancel()", () => {
    it("delegates to setStatus + stamps canceledAt", () => {
      const s = makeSub({ status: "active" })
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.status).toBe("canceled")
      expect(s.canceledAt).toEqual(T1)
    })

    it("idempotent if already canceled", () => {
      const s = makeSub({ status: "active" })
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.canceledAt).toEqual(T1) // first call wins
    })
  })

  describe("scheduleCancellation() / clearScheduledCancellation()", () => {
    it("scheduleCancellation sets cancelAt without changing status", () => {
      const s = makeSub({ status: "active" })
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.cancelAt).toEqual(FUTURE)
      expect(s.status).toBe("active") // unchanged
    })

    it("scheduleCancellation rejects past dates", () => {
      const s = makeSub()
      expect(() =>
        s.scheduleCancellation(T0, ProfileId.fromPersistence(ACTOR_UUID), T1),
      ).toThrow(InvalidEntityError)
    })

    it("scheduleCancellation rejects on canceled subscription", () => {
      const s = makeSub({ status: "active" })
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.scheduleCancellation(
          FUTURE,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("scheduleCancellation: idempotent on same date", () => {
      const s = makeSub()
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T1)
      const before = s.updatedAt
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.updatedAt).toBe(before)
    })

    it("clearScheduledCancellation: idempotent if already null", () => {
      const s = makeSub()
      const before = s.updatedAt
      s.clearScheduledCancellation(
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })

    it("clearScheduledCancellation removes cancelAt", () => {
      const s = makeSub()
      s.scheduleCancellation(FUTURE, ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.clearScheduledCancellation(
        ProfileId.fromPersistence(ACTOR_UUID),
        T2,
      )
      expect(s.cancelAt).toBeNull()
    })
  })

  describe("changePlan()", () => {
    it("swaps planId", () => {
      const s = makeSub()
      s.changePlan(
        PlanId.fromPersistence(OTHER_PLAN_UUID),
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.planId.value).toBe(OTHER_PLAN_UUID)
    })

    it("idempotent on same plan", () => {
      const s = makeSub()
      const before = s.updatedAt
      s.changePlan(
        PlanId.fromPersistence(PLAN_UUID),
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })

    it("allowed on canceled subscription (data correction)", () => {
      const s = makeSub()
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.changePlan(
          PlanId.fromPersistence(OTHER_PLAN_UUID),
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).not.toThrow()
    })

    it("rejects on deleted subscription", () => {
      const s = makeSub()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(() =>
        s.changePlan(
          PlanId.fromPersistence(OTHER_PLAN_UUID),
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })
  })

  describe("updateBillingPeriod()", () => {
    it("syncs both timestamps", () => {
      const s = makeSub()
      s.updateBillingPeriod(
        T0,
        FUTURE,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.currentPeriodStart).toEqual(T0)
      expect(s.currentPeriodEnd).toEqual(FUTURE)
    })

    it("rejects end before start", () => {
      const s = makeSub()
      expect(() =>
        s.updateBillingPeriod(
          T1,
          T0,
          ProfileId.fromPersistence(ACTOR_UUID),
          T2,
        ),
      ).toThrow(InvalidEntityError)
    })

    it("no-op when equal", () => {
      const s = makeSub({
        currentPeriodStart: T0,
        currentPeriodEnd: FUTURE,
      })
      const before = s.updatedAt
      s.updateBillingPeriod(
        T0,
        FUTURE,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })
  })

  describe("linkStripeSubscription()", () => {
    it("sets the Stripe sub id", () => {
      const s = makeSub()
      s.linkStripeSubscription(
        "sub_ABC",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.stripeSubscriptionId).toBe("sub_ABC")
    })

    it("idempotent", () => {
      const s = makeSub({ stripeSubscriptionId: "sub_ABC" })
      const before = s.updatedAt
      s.linkStripeSubscription(
        "sub_ABC",
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      expect(s.updatedAt).toBe(before)
    })
  })

  describe("softDelete()", () => {
    it("sets deletedAt and bumps audit", () => {
      const s = makeSub()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      expect(s.deletedAt).toEqual(T1)
    })

    it("idempotent", () => {
      const s = makeSub()
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.deletedAt).toEqual(T1)
    })

    it("softDelete is independent of cancel — both can be set", () => {
      const s = makeSub({ status: "active" })
      s.cancel(ProfileId.fromPersistence(ACTOR_UUID), T1)
      s.softDelete(ProfileId.fromPersistence(ACTOR_UUID), T2)
      expect(s.status).toBe("canceled")
      expect(s.canceledAt).toEqual(T1)
      expect(s.deletedAt).toEqual(T2)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields", () => {
      const original = makeSub({
        currentPeriodStart: T0,
        currentPeriodEnd: FUTURE,
        stripeSubscriptionId: "sub_XYZ",
      })
      original.scheduleCancellation(
        FUTURE,
        ProfileId.fromPersistence(ACTOR_UUID),
        T1,
      )
      const snapshot = original.toJSON()
      expect(Subscription.fromJSON(snapshot).toJSON()).toEqual(snapshot)
    })

    it("snapshot has primitive types", () => {
      const s = makeSub()
      const out = s.toJSON()
      expect(typeof out.id).toBe("string")
      expect(typeof out.tenantId).toBe("string")
      expect(typeof out.planId).toBe("string")
      expect(out.cancelAt).toBeNull()
      expect(out.canceledAt).toBeNull()
    })
  })
})
