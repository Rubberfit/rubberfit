import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { ResendInvitationUseCase } from "@/src/application/use-cases/invitations/resend-invitation.use-case"
import { Invitation } from "@/src/entities/invitation"
import { Email } from "@/src/entities/value-objects/email"
import { InvitationId, ProfileId, TenantId } from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

vi.mock("@/src/infrastructure/services/active-tenant.service", () => ({
  loadTenantName: vi.fn().mockResolvedValue("Acme Co"),
}))

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

const FAKE_CLIENT = {} as unknown as SupabaseClient

function makeInvitation(
  overrides: Partial<{
    acceptedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
    tenantId: string
  }> = {}
): Invitation {
  return Invitation.reconstitute({
    id: InvitationId.fromPersistence(INVITATION_UUID),
    tenantId: TenantId.fromPersistence(overrides.tenantId ?? TENANT_UUID),
    email: Email.fromPersistence("invitee@example.com"),
    roles: ["member"],
    token: InvitationToken.fromPersistence("b".repeat(64)),
    expiresAt: overrides.expiresAt ?? new Date("2999-01-01T00:00:00.000Z"),
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

function makeFakeEmailService(): IEmailService {
  return {
    sendEmail: vi.fn(),
    sendLowStockAlert: vi.fn(),
    sendPriceChangeAlert: vi.fn(),
    sendPOApprovalRequest: vi.fn(),
    sendPOStatusUpdate: vi.fn(),
    sendDailyDigest: vi.fn(),
    sendWelcomeEmail: vi.fn(),
    sendInvitation: vi.fn(),
    queueEmail: vi.fn(),
    processEmailQueue: vi.fn(),
    sendBulkEmails: vi.fn(),
  }
}

describe("ResendInvitationUseCase", () => {
  let invitations: IInvitationService
  let email: IEmailService
  let useCase: ResendInvitationUseCase

  beforeEach(() => {
    container.clearInstances()
    invitations = makeFakeInvitationService()
    email = makeFakeEmailService()
    container.registerInstance<IInvitationService>(TOKENS.IInvitationService, invitations)
    container.registerInstance<IEmailService>(TOKENS.IEmailService, email)
    useCase = container.resolve(ResendInvitationUseCase)
  })

  it("re-dispatches the email and records success", async () => {
    const persisted = makeInvitation()
    vi.mocked(invitations.getById).mockResolvedValue(persisted)
    vi.mocked(email.sendInvitation).mockResolvedValue({ success: true, messageId: "x" })
    vi.mocked(invitations.recordSendSuccess).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailSent).toBe(true)
    expect(invitations.recordSendSuccess).toHaveBeenCalledWith(INVITATION_UUID)
  })

  it("returns 404 when the invitation belongs to a different tenant", async () => {
    const persisted = makeInvitation({ tenantId: "44444444-4444-4444-8444-444444444444" })
    vi.mocked(invitations.getById).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(404)
    expect(email.sendInvitation).not.toHaveBeenCalled()
  })

  it("refuses to resend an accepted invitation (409)", async () => {
    const persisted = makeInvitation({ acceptedAt: new Date("2026-05-15T12:00:00.000Z") })
    vi.mocked(invitations.getById).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(email.sendInvitation).not.toHaveBeenCalled()
  })

  it("refuses to resend a revoked invitation (409)", async () => {
    const persisted = makeInvitation({ revokedAt: new Date("2026-05-15T12:00:00.000Z") })
    vi.mocked(invitations.getById).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
  })

  it("refuses to resend an expired invitation (409)", async () => {
    const persisted = makeInvitation({ expiresAt: new Date("2020-01-01T00:00:00.000Z") })
    vi.mocked(invitations.getById).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
  })

  it("records send failure but reports ok when the email dispatch fails", async () => {
    const persisted = makeInvitation()
    vi.mocked(invitations.getById).mockResolvedValue(persisted)
    vi.mocked(email.sendInvitation).mockResolvedValue({ success: false, error: "Resend down" })
    vi.mocked(invitations.recordSendFailure).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      invitationId: INVITATION_UUID,
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailSent).toBe(false)
    expect(result.emailError).toBe("Resend down")
    expect(invitations.recordSendFailure).toHaveBeenCalledWith(INVITATION_UUID, "Resend down")
  })
})
