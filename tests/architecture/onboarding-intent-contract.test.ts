import { describe, expect, it } from "vitest"

import {
  DEFAULT_ONBOARDING_INTENT,
  parseOnboardingIntent,
} from "@/app/(auth)/_lib/onboarding-intent"

describe("onboarding-intent URL contract (PR 7)", () => {
  it("accepts exactly the tier codes the marketing pricing page emits", () => {
    for (const plan of ["standard", "pro", "max"] as const) {
      const parsed = parseOnboardingIntent({ plan, billing: "annual" })
      expect(parsed.plan).toBe(plan)
    }
  })

  it("accepts exactly the billing intervals the marketing toggle emits", () => {
    for (const billing of ["monthly", "annual"] as const) {
      const parsed = parseOnboardingIntent({ plan: "pro", billing })
      expect(parsed.billing).toBe(billing)
    }
  })

  it("rejects unknown plan tiers without silently coercing them", () => {
    const parsed = parseOnboardingIntent({ plan: "enterprise", billing: "annual" })
    expect(parsed.plan).toBeUndefined()
  })

  it("rejects unknown billing intervals", () => {
    const parsed = parseOnboardingIntent({ plan: "pro", billing: "quarterly" })
    expect(parsed.billing).toBeUndefined()
  })

  it("default intent is pro / annual", () => {
    expect(DEFAULT_ONBOARDING_INTENT).toEqual({ plan: "pro", billing: "annual" })
  })
})
