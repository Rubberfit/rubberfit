/**
 * createBillingPortalSession action tests.
 *
 * What we're enforcing:
 *   - Auth + DB factory registration happen before the use-case fires
 *   - Zod schema rejects open-redirect-shaped returnPaths at the action
 *     boundary (the use-case has its own defense, but bouncing early
 *     keeps the typed error space tighter)
 *   - Typed use-case errors are mapped to user-facing strings — the
 *     client renders these directly
 *   - Successful execution returns the Stripe Portal URL unchanged
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TOKENS } from "@/di/tokens"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { ICreateBillingPortalSessionUseCase } from "@/src/application/use-cases/billing/create-billing-portal-session.use-case"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "owner@acme.example",
  roles: ["manager"],
  isSuperAdmin: false,
  activeTenantId: null,
}

const ORG_ID = "00000000-0000-4000-8000-000000000001"
const PORTAL_URL = "https://billing.stripe.com/p/session/test_123"

function makeUseCase(
  execute: ICreateBillingPortalSessionUseCase["execute"]
): ICreateBillingPortalSessionUseCase {
  return { execute: vi.fn(execute) }
}

describe("app/actions/billing.createBillingPortalSession", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    resolveUseCaseMock.mockReset()
    ensureDatabaseFactoryRegisteredMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns the Portal URL on the happy path", async () => {
    resolveUseCaseMock.mockImplementation((token: symbol) => {
      if (token === TOKENS.ICreateBillingPortalSessionUseCase) {
        return makeUseCase(async () => ({ url: PORTAL_URL }))
      }
      throw new Error(`unexpected token ${token.toString()}`)
    })

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: ORG_ID })

    expect(result).toEqual({ url: PORTAL_URL })
    expect(ensureDatabaseFactoryRegisteredMock).toHaveBeenCalledOnce()
    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
  })

  it("registers the DB factory and authenticates BEFORE resolving the use-case", async () => {
    resolveUseCaseMock.mockImplementation(() => makeUseCase(async () => ({ url: PORTAL_URL })))

    const { createBillingPortalSession } = await import("@/app/actions/billing")
    await createBillingPortalSession({ organizationId: ORG_ID })

    const factoryOrder = ensureDatabaseFactoryRegisteredMock.mock.invocationCallOrder[0] ?? -1
    const authOrder = requireAuthenticatedUserMock.mock.invocationCallOrder[0] ?? -1
    const resolveOrder = resolveUseCaseMock.mock.invocationCallOrder[0] ?? -1
    expect(factoryOrder).toBeGreaterThan(0)
    expect(authOrder).toBeGreaterThan(factoryOrder)
    expect(resolveOrder).toBeGreaterThan(authOrder)
  })

  it("rejects an invalid organizationId without resolving the use-case", async () => {
    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: "not-a-uuid" })

    expect(result).toEqual({ error: "Invalid input" })
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it.each([
    ["absolute URL", "https://evil.example/dashboard"],
    ["protocol-relative", "//evil.example"],
    ["backslash", "/dashboard\\evil"],
    ["bare path", "dashboard/settings/billing"],
    ["http scheme", "http://localhost/x"],
  ])("rejects open-redirect-shaped returnPath: %s", async (_label, returnPath) => {
    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({
      organizationId: ORG_ID,
      returnPath,
    })

    expect(result).toEqual({ error: "Invalid input" })
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("propagates unauthenticated rejections without invoking the use-case", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { createBillingPortalSession } = await import("@/app/actions/billing")

    await expect(createBillingPortalSession({ organizationId: ORG_ID })).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("maps the 'forbidden' use-case error to a user-facing string", async () => {
    resolveUseCaseMock.mockImplementation(() => makeUseCase(async () => ({ error: "forbidden" })))

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: ORG_ID })

    expect(result).toEqual({
      error: "Only organization owners and admins can manage billing.",
    })
  })

  it("maps the 'enterprise_account' use-case error to a user-facing string", async () => {
    resolveUseCaseMock.mockImplementation(() =>
      makeUseCase(async () => ({ error: "enterprise_account" }))
    )

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: ORG_ID })

    expect(result).toEqual({
      error: "Enterprise contracts are managed by your account manager.",
    })
  })

  it("maps the 'stripe_portal_unavailable' use-case error to a user-facing string", async () => {
    resolveUseCaseMock.mockImplementation(() =>
      makeUseCase(async () => ({ error: "stripe_portal_unavailable" }))
    )

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: ORG_ID })

    expect(result).toEqual({
      error: "Stripe billing portal is temporarily unavailable. Please try again in a moment.",
    })
  })

  it("returns a sanitized error when the use-case throws unexpectedly — raw error text never leaks", async () => {
    resolveUseCaseMock.mockImplementation(() =>
      makeUseCase(async () => {
        throw new Error("DI exploded: secret token sk_live_redacted")
      })
    )

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    const result = await createBillingPortalSession({ organizationId: ORG_ID })

    expect(result).toEqual({ error: "Unable to open billing portal. Please try again." })
    if ("error" in result) {
      expect(result.error).not.toContain("DI exploded")
      expect(result.error).not.toContain("sk_live_redacted")
    }
  })

  it("forwards a same-origin returnPath to the use-case", async () => {
    const captured: Array<unknown> = []
    resolveUseCaseMock.mockImplementation(() =>
      makeUseCase(async (input) => {
        captured.push(input)
        return { url: PORTAL_URL }
      })
    )

    const { createBillingPortalSession } = await import("@/app/actions/billing")

    await createBillingPortalSession({
      organizationId: ORG_ID,
      returnPath: "/dashboard/settings/team",
    })

    expect(captured[0]).toMatchObject({
      organizationId: ORG_ID,
      returnPath: "/dashboard/settings/team",
      actor: ACTOR,
    })
  })
})
