import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { AcceptInvitationUseCase } from "@/src/application/use-cases/invitations/accept-invitation.use-case"

const ACTOR_UUID = "22222222-2222-4222-8222-222222222222"
const TENANT_UUID = "11111111-1111-4111-8111-111111111111"
const MEMBERSHIP_UUID = "33333333-3333-4333-8333-333333333333"
const TOKEN = "d".repeat(64)

const ACTOR: ActionActor = {
  id: ACTOR_UUID,
  email: "invitee@example.com",
  roles: [],
  isSuperAdmin: false,
  activeTenantId: null,
}

function makeFakeInvitationService(): IInvitationService {
  return {
    getById: vi.fn(),
    getByToken: vi.fn(),
    getActiveByEmail: vi.fn(),
    listPending: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    recordSendSuccess: vi.fn(),
    recordSendFailure: vi.fn(),
    acceptByToken: vi.fn(),
    findPublicViewByToken: vi.fn(),
  }
}

describe("AcceptInvitationUseCase", () => {
  let invitations: IInvitationService
  let useCase: AcceptInvitationUseCase

  beforeEach(() => {
    container.clearInstances()
    invitations = makeFakeInvitationService()
    container.registerInstance<IInvitationService>(TOKENS.IInvitationService, invitations)
    useCase = container.resolve(AcceptInvitationUseCase)
  })

  it("returns success with membership + tenant on happy path", async () => {
    vi.mocked(invitations.acceptByToken).mockResolvedValue({
      membershipId: MEMBERSHIP_UUID,
      tenantId: TENANT_UUID,
    })

    const result = await useCase.execute({ actor: ACTOR, token: TOKEN })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.membershipId).toBe(MEMBERSHIP_UUID)
    expect(result.tenantId).toBe(TENANT_UUID)
  })

  it.each([
    ["P0002", "not_found", 404],
    ["P0003", "already_accepted", 409],
    ["P0004", "revoked", 409],
    ["P0005", "expired", 409],
    ["P0006", "email_mismatch", 409],
  ] as const)("maps SQLSTATE %s to reason %s with status %d", async (code, reason, status) => {
    vi.mocked(invitations.acceptByToken).mockRejectedValue({ code, message: reason })

    const result = await useCase.execute({ actor: ACTOR, token: TOKEN })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe(reason)
    expect(result.status).toBe(status)
  })

  it("falls back to 'unknown' for unrecognized error codes", async () => {
    vi.mocked(invitations.acceptByToken).mockRejectedValue({ code: "XX999", message: "weird" })

    const result = await useCase.execute({ actor: ACTOR, token: TOKEN })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("unknown")
  })

  it("returns 400 with reason 'not_found' when token is empty", async () => {
    const result = await useCase.execute({ actor: ACTOR, token: "" })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.reason).toBe("not_found")
    expect(invitations.acceptByToken).not.toHaveBeenCalled()
  })
})
