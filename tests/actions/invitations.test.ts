/**
 * Smoke tests for the invitations.ts server-action surface
 * (inviteMember, resendInvitation, revokeInvitation, acceptInvitation).
 *
 * Three admin actions (invite/resend/revoke) are subscription-gated +
 * permission-gated on `manageMembers`. `acceptInvitation` is the only
 * recovery-exempt action in this file — a newly-invited user has no
 * own subscription yet; the use-case validates the invited org's
 * subscription instead.
 *
 * Pattern mirrors `tests/actions/po-reconciliation.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ActionActor } from "@/src/application/types/action-actor"

const requireAuthenticatedUserMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-authenticated-user", () => ({
  requireAuthenticatedUser: requireAuthenticatedUserMock,
}))

const requireActiveSubscriptionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-active-subscription", () => ({
  requireActiveSubscription: requireActiveSubscriptionMock,
}))

const requirePermissionMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/auth/require-permission", () => ({
  requirePermission: requirePermissionMock,
}))

const resolveUseCaseMock = vi.hoisted(() => vi.fn())
vi.mock("@/di/resolve", () => ({
  resolveUseCase: resolveUseCaseMock,
}))

const ensureDatabaseFactoryRegisteredMock = vi.hoisted(() => vi.fn())
vi.mock("@/app/server/database/register-factory", () => ({
  ensureDatabaseFactoryRegistered: ensureDatabaseFactoryRegisteredMock,
}))

const getDatabaseClientMock = vi.hoisted(() => vi.fn())
vi.mock("@/src/infrastructure/supabase/get-database-client", () => ({
  getDatabaseClient: getDatabaseClientMock,
}))

const revalidatePathMock = vi.hoisted(() => vi.fn())
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}))

const cookieStoreMock = vi.hoisted(() => ({ set: vi.fn() }))
const cookiesMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}))

const ACTOR: ActionActor = {
  id: "00000000-0000-4000-8000-000000000099",
  email: "admin@example.com",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: "00000000-0000-4000-8000-0000000000a0",
}

const FAKE_DB_CLIENT = { __db: true }
const INVITATION_ID = "00000000-0000-4000-8000-000000000011"
const TOKEN = "tok_invite_aaaaaaaaaaaaaaaaaaaaaaaa"
const NEW_TENANT_ID = "00000000-0000-4000-8000-0000000000b1"
const MEMBERS_PAGE_PATH = "/dashboard/admin/members"

describe("app/actions/invitations", () => {
  beforeEach(() => {
    requireAuthenticatedUserMock.mockResolvedValue(ACTOR)
    requireActiveSubscriptionMock.mockResolvedValue({ kind: "allowed" })
    requirePermissionMock.mockReturnValue(undefined)
    getDatabaseClientMock.mockResolvedValue(FAKE_DB_CLIENT)
    cookieStoreMock.set.mockReset()
    cookiesMock.mockResolvedValue(cookieStoreMock)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ─── inviteMember ─────────────────────────────────────────────────────

  it("inviteMember threads actor + parsed input into the create use-case", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, invitation: { id: INVITATION_ID } })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { inviteMember } = await import("@/app/actions/invitations")
    const result = await inviteMember({ email: "bob@example.com", roles: ["member"] })

    expect(requireAuthenticatedUserMock).toHaveBeenCalledOnce()
    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMembers")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        client: FAKE_DB_CLIENT,
        actor: ACTOR,
        email: "bob@example.com",
        roles: ["member"],
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(MEMBERS_PAGE_PATH)
    expect(result).toEqual({ ok: true, invitation: { id: INVITATION_ID } })
  })

  it("inviteMember does NOT revalidate when the use-case returns ok: false", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: false, error: "duplicate" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { inviteMember } = await import("@/app/actions/invitations")
    await inviteMember({ email: "bob@example.com", roles: ["member"] })

    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("inviteMember rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { inviteMember } = await import("@/app/actions/invitations")
    await expect(inviteMember({ email: "bob@example.com", roles: ["member"] })).rejects.toThrow(
      "NO_ACTIVE_SUBSCRIPTION"
    )
    expect(requirePermissionMock).not.toHaveBeenCalled()
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("inviteMember rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { inviteMember } = await import("@/app/actions/invitations")
    await expect(inviteMember({ email: "bob@example.com", roles: ["member"] })).rejects.toThrow(
      "forbidden"
    )
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("inviteMember rejects empty roles array at Zod parse", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })
    const { inviteMember } = await import("@/app/actions/invitations")
    await expect(inviteMember({ email: "bob@example.com", roles: [] })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  // ─── resendInvitation ─────────────────────────────────────────────────

  it("resendInvitation threads actor + invitationId into the resend use-case", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { resendInvitation } = await import("@/app/actions/invitations")
    const result = await resendInvitation({ id: INVITATION_ID })

    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMembers")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        client: FAKE_DB_CLIENT,
        actor: ACTOR,
        invitationId: INVITATION_ID,
      })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(MEMBERS_PAGE_PATH)
    expect(result).toEqual({ ok: true })
  })

  it("resendInvitation rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { resendInvitation } = await import("@/app/actions/invitations")
    await expect(resendInvitation({ id: INVITATION_ID })).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
  })

  it("resendInvitation rejects non-UUID invitation id at Zod parse", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })
    const { resendInvitation } = await import("@/app/actions/invitations")
    await expect(resendInvitation({ id: "not-a-uuid" })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })

  // ─── revokeInvitation ─────────────────────────────────────────────────

  it("revokeInvitation threads actor + invitationId into the revoke use-case", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { revokeInvitation } = await import("@/app/actions/invitations")
    const result = await revokeInvitation({ id: INVITATION_ID })

    expect(requireActiveSubscriptionMock).toHaveBeenCalledWith(ACTOR)
    expect(requirePermissionMock).toHaveBeenCalledWith(ACTOR, "manageMembers")
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ actor: ACTOR, invitationId: INVITATION_ID })
    )
    expect(revalidatePathMock).toHaveBeenCalledWith(MEMBERS_PAGE_PATH)
    expect(result).toEqual({ ok: true })
  })

  it("revokeInvitation rejects when subscription is lapsed", async () => {
    requireActiveSubscriptionMock.mockRejectedValue(new Error("NO_ACTIVE_SUBSCRIPTION"))
    const { revokeInvitation } = await import("@/app/actions/invitations")
    await expect(revokeInvitation({ id: INVITATION_ID })).rejects.toThrow("NO_ACTIVE_SUBSCRIPTION")
  })

  it("revokeInvitation rejects when permission fails", async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new Error("forbidden")
    })
    const { revokeInvitation } = await import("@/app/actions/invitations")
    await expect(revokeInvitation({ id: INVITATION_ID })).rejects.toThrow("forbidden")
  })

  // ─── acceptInvitation (recovery-exempt: no subscription gate) ─────────

  it("acceptInvitation runs WITHOUT calling requireActiveSubscription (recovery-exempt)", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ ok: true, tenantId: NEW_TENANT_ID, membershipId: "mem-1" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { acceptInvitation } = await import("@/app/actions/invitations")
    await acceptInvitation({ token: TOKEN })

    // The whole point of the allowlist entry: newly-invited users have
    // no own subscription. If this fires, the gate broke.
    expect(requireActiveSubscriptionMock).not.toHaveBeenCalled()
    expect(execute).toHaveBeenCalledWith({ actor: ACTOR, token: TOKEN })
  })

  it("acceptInvitation writes the rema_active_tenant cookie + revalidates root layout on success", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ ok: true, tenantId: NEW_TENANT_ID, membershipId: "mem-1" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { acceptInvitation } = await import("@/app/actions/invitations")
    const result = await acceptInvitation({ token: TOKEN })

    expect(cookieStoreMock.set).toHaveBeenCalledWith(
      "rema_active_tenant",
      NEW_TENANT_ID,
      expect.any(Object)
    )
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout")
    expect(result).toEqual({ ok: true, tenantId: NEW_TENANT_ID, membershipId: "mem-1" })
  })

  it("acceptInvitation does NOT set cookie when the use-case returns ok: false", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: false, error: "invalid_token" })
    resolveUseCaseMock.mockReturnValue({ execute })

    const { acceptInvitation } = await import("@/app/actions/invitations")
    await acceptInvitation({ token: TOKEN })

    expect(cookieStoreMock.set).not.toHaveBeenCalled()
    expect(revalidatePathMock).not.toHaveBeenCalled()
  })

  it("acceptInvitation rejects when auth fails (still requires authentication)", async () => {
    requireAuthenticatedUserMock.mockRejectedValue(new Error("unauth"))
    const { acceptInvitation } = await import("@/app/actions/invitations")
    await expect(acceptInvitation({ token: TOKEN })).rejects.toThrow("unauth")
    expect(resolveUseCaseMock).not.toHaveBeenCalled()
  })

  it("acceptInvitation rejects empty token at Zod parse", async () => {
    const execute = vi.fn()
    resolveUseCaseMock.mockReturnValue({ execute })
    const { acceptInvitation } = await import("@/app/actions/invitations")
    await expect(acceptInvitation({ token: "" })).rejects.toThrow()
    expect(execute).not.toHaveBeenCalled()
  })
})
