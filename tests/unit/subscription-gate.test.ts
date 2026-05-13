import { describe, expect, it } from "vitest"

import {
  deriveRecoveryIntent,
  isSubscriptionAllowed,
  type BillingStatus,
} from "@/src/application/billing/subscription-gate"

const STATUSES: readonly BillingStatus[] = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]

describe("subscription-gate", () => {
  it("allows only trialing and active subscriptions", () => {
    const expected: Record<BillingStatus, boolean> = {
      incomplete: false,
      incomplete_expired: false,
      trialing: true,
      active: true,
      past_due: false,
      canceled: false,
      unpaid: false,
      paused: false,
    }

    for (const status of STATUSES) {
      expect(isSubscriptionAllowed(status), status).toBe(expected[status])
    }
  })

  it("maps blocked statuses to the correct recovery intent", () => {
    const expected: Partial<Record<BillingStatus, string>> = {
      incomplete: "complete_checkout",
      incomplete_expired: "complete_checkout",
      past_due: "update_billing",
      unpaid: "update_billing",
      canceled: "restart_subscription",
      paused: "restart_subscription",
    }

    for (const status of STATUSES) {
      if (status === "trialing" || status === "active") {
        expect(() => deriveRecoveryIntent(status), status).toThrow(/does not need recovery/)
      } else {
        expect(deriveRecoveryIntent(status), status).toBe(expected[status])
      }
    }
  })
})
