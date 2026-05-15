import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { RevokeInvitationUseCase } from "@/src/application/use-cases/invitations/revoke-invitation.use-case"
import { Invitation } from "@/src/entities/invitation"
import { Email } from "@/src/entities/value-objects/email"
import { InvitationId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

const TENANT_UUID = "11111111-1111-4111-8111-111111111111"
const ACTOR_UUID = "22222222-2222-4222-8222-222222222222"
const INVITATION_UUID = "33333333-3333-4333-8333-333333333333"

const ACTOR: ActionActor = {
  id: ACTOR_UUID,
  email: "admin@rema.local",
  roles: ["admin"],
  isSuperAdmin: false,
  activeTenantId: TENANT_UUID,
}

function makeInvitation(
  overrides: Partial<{ acceptedAt: Date | null; revokedAt: Date | null; tenantId: string }> = {}
): Invitation {
  return Invitation.reconstitute({
    id: InvitationId.fromPersistence(INVITATION_UUID),
    tenantId: TenantId.fromPersistence(overrides.tenantId ?? TENANT_UUID),
    email: Email.fromPersistence("invitee@example.com"),
    roles: ["member"],
    token: InvitationToken.fromPersistence("c".repeat(64)),
    expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    invitedBy: ProfileId.fromPersistence(ACTOR_UUID),
    acceptedAt: overrides.acceptedAt ?? null,
    revokedAt: overrides.revokedAt ?? null,
    lastSendAttemptAt: null,
    lastSendError: null,
    createdAt: new Date("2026-05-15T12:00:00.000Z"),
  })
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

describe("RevokeInvitationUseCase", () => {
  let invitations: IInvitationService
  let useCase: RevokeInvitationUseCase

  beforeEach(() => {
    container.clearInstances()
    invitations = makeFakeInvitationService()
    container.registerInstance<IInvitationService>(TOKENS.IInvitationService, invitations)
    useCase = container.resolve(RevokeInvitationUseCase)
  })

  it("revokes a pending invitation", async () => {
    const pending = makeInvitation()
    const revoked = makeInvitation({ revokedAt: new Date("2026-05-15T12:00:00.000Z") })
    vi.mocked(invitations.getById).mockResolvedValue(pending)
    vi.mocked(invitations.revoke).mockResolvedValue(revoked)

    const result = await useCase.execute({ actor: ACTOR, invitationId: INVITATION_UUID })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(invitations.revoke).toHaveBeenCalledWith(INVITATION_UUID)
  })

  it("refuses to revoke an accepted invitation (409)", async () => {
    const accepted = makeInvitation({ acceptedAt: new Date("2026-05-15T12:00:00.000Z") })
    vi.mocked(invitations.getById).mockResolvedValue(accepted)

    const result = await useCase.execute({ actor: ACTOR, invitationId: INVITATION_UUID })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(invitations.revoke).not.toHaveBeenCalled()
  })

  it("returns 404 for cross-tenant lookup", async () => {
    const otherTenant = makeInvitation({ tenantId: "44444444-4444-4444-8444-444444444444" })
    vi.mocked(invitations.getById).mockResolvedValue(otherTenant)

    const result = await useCase.execute({ actor: ACTOR, invitationId: INVITATION_UUID })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(invitations.revoke).not.toHaveBeenCalled()
  })

  it("returns 404 when the invitation does not exist", async () => {
    vi.mocked(invitations.getById).mockRejectedValue(new Error("not found"))

    const result = await useCase.execute({ actor: ACTOR, invitationId: INVITATION_UUID })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
  })

  it("returns 400 when actor has no active tenant", async () => {
    const result = await useCase.execute({
      actor: { ...ACTOR, activeTenantId: null },
      invitationId: INVITATION_UUID,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(invitations.getById).not.toHaveBeenCalled()
  })
})
