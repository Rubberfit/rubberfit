import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it, vi } from "vitest"

import type { BillingStatus } from "@/src/application/billing/subscription-gate"
import { getSubscriptionGateForUser } from "@/src/infrastructure/services/organizationBillingService"

const TENANT_ID = "00000000-0000-4000-8000-000000000001"
const USER_ID = "00000000-0000-4000-8000-000000000002"
const SUB_ROW_ID = "00000000-0000-4000-8000-000000000003"

interface FakeQuery {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  is: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
}

function makeFakeClient(result: { data: unknown; error: unknown }) {
  const query: FakeQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  }
  query.select.mockImplementation(() => query)
  query.eq.mockImplementation(() => query)
  query.is.mockImplementation(() => query)
  query.limit.mockImplementation(() => query)
  const client = {
    from: vi.fn(() => query),
  }
  return { client: client as unknown as SupabaseClient, query }
}

function subscription(status: BillingStatus, overrides: Record<string, unknown> = {}) {
  return {
    id: SUB_ROW_ID,
    stripe_subscription_id: "sub_test_123",
    status,
    plan_tier: "standard",
    cancel_at_period_end: false,
    cancel_at: null,
    current_period_end: null,
    is_current: true,
    ...overrides,
  }
}

function tenantRow(currentSubscription: unknown) {
  return {
    id: TENANT_ID,
    current_subscription: currentSubscription,
  }
}

describe("organizationBillingService.getSubscriptionGateForUser", () => {
  it("queries tenants with an inner join through memberships, filtered on active membership and the current subscription row", async () => {
    const { client, query } = makeFakeClient({ data: null, error: null })

    await getSubscriptionGateForUser(client, USER_ID)

    const fromMock = client.from as unknown as ReturnType<typeof vi.fn>
    expect(fromMock).toHaveBeenCalledWith("tenants")
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("membership:memberships!inner")
    )
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining("current_subscription:subscriptions")
    )
    // Active membership = deleted_at IS NULL (status column exists but is a
    // legacy carry-over; production deactivation writes only deleted_at).
    expect(query.eq).toHaveBeenCalledWith("membership.profile_id", USER_ID)
    expect(query.is).toHaveBeenCalledWith("membership.deleted_at", null)
    expect(query.eq).toHaveBeenCalledWith("current_subscription.is_current", true)
    expect(query.limit).toHaveBeenCalledWith(1)
  })

  it("returns needs_workspace when no active membership is visible (covers both missing and deactivated rows)", async () => {
    const { client } = makeFakeClient({ data: null, error: null })

    await expect(getSubscriptionGateForUser(client, USER_ID)).resolves.toEqual({
      kind: "needs_workspace",
    })
  })

  it("returns complete-checkout blocked state when membership exists without a current subscription", async () => {
    const { client } = makeFakeClient({
      data: tenantRow([]),
      error: null,
    })

    const result = await getSubscriptionGateForUser(client, USER_ID)

    expect(result).toEqual({
      kind: "blocked",
      organizationId: TENANT_ID,
      status: "missing",
      recovery: "complete_checkout",
    })
  })

  it.each([
    ["incomplete", "complete_checkout"],
    ["incomplete_expired", "complete_checkout"],
    ["past_due", "update_billing"],
    ["unpaid", "update_billing"],
    ["canceled", "restart_subscription"],
    ["paused", "restart_subscription"],
  ] as const)("blocks %s with %s recovery", async (status, recovery) => {
    const { client } = makeFakeClient({
      data: tenantRow([subscription(status)]),
      error: null,
    })

    const result = await getSubscriptionGateForUser(client, USER_ID)

    expect(result).toEqual({
      kind: "blocked",
      organizationId: TENANT_ID,
      status,
      recovery,
    })
  })

  it.each(["trialing", "active"] as const)("allows %s subscriptions", async (status) => {
    const { client } = makeFakeClient({
      data: tenantRow([subscription(status)]),
      error: null,
    })

    const result = await getSubscriptionGateForUser(client, USER_ID)

    expect(result).toEqual({
      kind: "allowed",
      organizationId: TENANT_ID,
      subscriptionId: "sub_test_123",
      status,
      planTier: "standard",
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: null,
    })
  })

  it("propagates cancellation fields for allowed subscriptions", async () => {
    const { client } = makeFakeClient({
      data: tenantRow(
        subscription("active", {
          cancel_at_period_end: true,
          cancel_at: "2026-06-01T00:00:00.000Z",
          current_period_end: "2026-06-01T00:00:00.000Z",
        })
      ),
      error: null,
    })

    const result = await getSubscriptionGateForUser(client, USER_ID)

    expect(result).toMatchObject({
      kind: "allowed",
      cancelAtPeriodEnd: true,
      cancelAt: "2026-06-01T00:00:00.000Z",
      currentPeriodEnd: "2026-06-01T00:00:00.000Z",
    })
  })

  it("uses one tenants query scoped to the active member and current subscription", async () => {
    const { client, query } = makeFakeClient({
      data: tenantRow([subscription("active")]),
      error: null,
    })

    await getSubscriptionGateForUser(client, USER_ID)

    expect(client.from).toHaveBeenCalledOnce()
    expect(client.from).toHaveBeenCalledWith("tenants")
    expect(query.eq).toHaveBeenCalledWith("membership.profile_id", USER_ID)
    expect(query.is).toHaveBeenCalledWith("membership.deleted_at", null)
    expect(query.eq).toHaveBeenCalledWith("current_subscription.is_current", true)
  })

  it("throws Supabase errors instead of allowing by default", async () => {
    const error = { message: "database unavailable" }
    const { client } = makeFakeClient({ data: null, error })

    await expect(getSubscriptionGateForUser(client, USER_ID)).rejects.toBe(error)
  })
})
