/**
 * `selectSubscriptionPlanTier` action tests — added in response to the
 * tier-picker bypass fix. Focus is the in-app guards that gate the
 * tier-change call BEFORE it can mutate any row:
 *   - Membership: only owners/admins may change the pre-checkout tier.
 *   - Subscription presence: surfaces a stable error when none exists.
 *   - Status guard: only `incomplete` / `incomplete_expired` rows are
 *     mutable through this action. `active` / `trialing` / `past_due`
 *     route through the Billing Portal — the action must refuse them.
 *   - Happy path: routes through the in-place
 *     `updateSubscriptionPlanTierAndSeats` (NOT `upsertSubscription`)
 *     so pre-set fields like `trial_end`, `stripe_price_id`, and
 *     `billing_interval` survive a tier change. The general upsert
 *     path demote-and-inserts when no `stripe_subscription_id` is in
 *     hand, which would null those columns.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"
import type { OrganizationSubscription } from "@/src/infrastructure/models/billing"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const getMemberRoleMock = vi.hoisted(() => vi.fn())
const getCurrentSubscriptionMock = vi.hoisted(() => vi.fn())
const updateSubscriptionPlanTierAndSeatsMock = vi.hoisted(() => vi.fn())
const upsertSubscriptionMock = vi.hoisted(() => vi.fn())

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-0000-0000-0000000000aa",
  email: "owner@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: null,
}

const ORG_ID = "11111111-1111-1111-1111-111111111111"
const SUBSCRIPTION_ID = "22222222-2222-2222-2222-222222222222"

const baseSubscription: OrganizationSubscription = {
  id: SUBSCRIPTION_ID,
  organization_id: ORG_ID,
  stripe_subscription_id: null,
  stripe_subscription_item_id: null,
  stripe_price_id: null,
  stripe_product_id: null,
  latest_invoice_id: null,
  plan_tier: "standard",
  billing_interval: null,
  seat_count: 5,
  status: "incomplete",
  trial_end: "2026-06-01T00:00:00.000Z",
  current_period_start: null,
  current_period_end: null,
  cancel_at_period_end: false,
  cancel_at: null,
  canceled_at: null,
  last_payment_status: null,
  last_stripe_event_id: null,
  last_stripe_event_created_at: null,
  is_current: true,
  created_at: "2026-05-12T00:00:00.000Z",
  updated_at: "2026-05-12T00:00:00.000Z",
}

describe("app/actions/billing.selectSubscriptionPlanTier", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    getMemberRoleMock.mockResolvedValue("admin")
    getCurrentSubscriptionMock.mockResolvedValue(baseSubscription)
    updateSubscriptionPlanTierAndSeatsMock.mockResolvedValue(baseSubscription)
    resolveUseCaseMock.mockReturnValue({
      getMemberRole: getMemberRoleMock,
      getCurrentSubscription: getCurrentSubscriptionMock,
      updateSubscriptionPlanTierAndSeats: updateSubscriptionPlanTierAndSeatsMock,
      upsertSubscription: upsertSubscriptionMock,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("rejects non-owner/admin callers with forbidden", async () => {
    getMemberRoleMock.mockResolvedValueOnce("member")
    const { selectSubscriptionPlanTier } = await import("@/app/actions/billing")

    const result = await selectSubscriptionPlanTier({
      organizationId: ORG_ID,
      planTier: "pro",
      seatCount: 10,
    })

    expect(result).toEqual({ error: "forbidden" })
    expect(updateSubscriptionPlanTierAndSeatsMock).not.toHaveBeenCalled()
    expect(upsertSubscriptionMock).not.toHaveBeenCalled()
  })

  it("returns subscription_not_found when no current subscription exists", async () => {
    getCurrentSubscriptionMock.mockResolvedValueOnce(null)
    const { selectSubscriptionPlanTier } = await import("@/app/actions/billing")

    const result = await selectSubscriptionPlanTier({
      organizationId: ORG_ID,
      planTier: "pro",
      seatCount: 10,
    })

    expect(result).toEqual({ error: "subscription_not_found" })
    expect(updateSubscriptionPlanTierAndSeatsMock).not.toHaveBeenCalled()
  })

  it.each(["active", "trialing", "past_due", "canceled"] as const)(
    "refuses status=%s — tier changes must route through the Billing Portal",
    async (status) => {
      getCurrentSubscriptionMock.mockResolvedValueOnce({ ...baseSubscription, status })
      const { selectSubscriptionPlanTier } = await import("@/app/actions/billing")

      const result = await selectSubscriptionPlanTier({
        organizationId: ORG_ID,
        planTier: "max",
        seatCount: 25,
      })

      expect(result).toEqual({ error: "subscription_already_active" })
      expect(updateSubscriptionPlanTierAndSeatsMock).not.toHaveBeenCalled()
    }
  )

  it.each(["incomplete", "incomplete_expired"] as const)(
    "patches plan_tier + seat_count in place when status=%s — preserves stripe_customer_id and trial_end",
    async (status) => {
      getCurrentSubscriptionMock.mockResolvedValueOnce({ ...baseSubscription, status })
      const { selectSubscriptionPlanTier } = await import("@/app/actions/billing")

      const result = await selectSubscriptionPlanTier({
        organizationId: ORG_ID,
        planTier: "pro",
        seatCount: 15,
      })

      expect(result).toEqual({ ok: true })
      // In-place update by subscription id — NOT upsertSubscription, which
      // would demote-and-insert and drop trial_end / stripe_price_id /
      // billing_interval when no stripe_subscription_id is in hand.
      expect(updateSubscriptionPlanTierAndSeatsMock).toHaveBeenCalledWith({
        subscriptionId: SUBSCRIPTION_ID,
        planTier: "pro",
        seatCount: 15,
      })
      expect(upsertSubscriptionMock).not.toHaveBeenCalled()
    }
  )

  it("rejects malformed input before any service call", async () => {
    const { selectSubscriptionPlanTier } = await import("@/app/actions/billing")

    const result = await selectSubscriptionPlanTier({
      organizationId: "not-a-uuid",
      planTier: "pro",
      seatCount: 15,
    })

    expect(result).toEqual({ error: "Invalid input" })
    expect(getMemberRoleMock).not.toHaveBeenCalled()
    expect(getCurrentSubscriptionMock).not.toHaveBeenCalled()
    expect(updateSubscriptionPlanTierAndSeatsMock).not.toHaveBeenCalled()
  })
})
