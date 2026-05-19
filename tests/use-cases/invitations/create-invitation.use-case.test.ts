import "reflect-metadata"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { container } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import { CreateInvitationUseCase } from "@/src/application/use-cases/invitations/create-invitation.use-case"
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

function makePersistedInvitation(): Invitation {
  return Invitation.reconstitute({
    id: InvitationId.fromPersistence(INVITATION_UUID),
    tenantId: TenantId.fromPersistence(TENANT_UUID),
    email: Email.fromPersistence("invitee@example.com"),
    roles: ["member"],
    token: InvitationToken.fromPersistence("a".repeat(64)),
    expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    invitedBy: ProfileId.fromPersistence(ACTOR_UUID),
    acceptedAt: null,
    revokedAt: null,
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

describe("CreateInvitationUseCase", () => {
  let invitations: IInvitationService
  let email: IEmailService
  let useCase: CreateInvitationUseCase

  beforeEach(() => {
    container.clearInstances()
    invitations = makeFakeInvitationService()
    email = makeFakeEmailService()
    container.registerInstance<IInvitationService>(TOKENS.IInvitationService, invitations)
    container.registerInstance<IEmailService>(TOKENS.IEmailService, email)
    useCase = container.resolve(CreateInvitationUseCase)
  })

  it("creates the invitation, sends the email, and records send success", async () => {
    const persisted = makePersistedInvitation()
    vi.mocked(invitations.getActiveByEmail).mockResolvedValue(null)
    vi.mocked(invitations.create).mockResolvedValue(persisted)
    vi.mocked(email.sendInvitation).mockResolvedValue({
      success: true,
      messageId: "abc",
    })
    vi.mocked(invitations.recordSendSuccess).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      email: "invitee@example.com",
      roles: ["member"],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailSent).toBe(true)
    expect(result.emailError).toBeNull()
    expect(invitations.recordSendSuccess).toHaveBeenCalledWith(INVITATION_UUID)
    expect(invitations.recordSendFailure).not.toHaveBeenCalled()

    const sendArgs = vi.mocked(email.sendInvitation).mock.calls[0]![0]
    expect(sendArgs.to).toBe("invitee@example.com")
    expect(sendArgs.tenantName).toBe("Acme Co")
    expect(sendArgs.acceptUrl.startsWith("https://app.example.com/invite/")).toBe(true)
  })

  it("records send failure but persists the row when email dispatch fails", async () => {
    const persisted = makePersistedInvitation()
    vi.mocked(invitations.getActiveByEmail).mockResolvedValue(null)
    vi.mocked(invitations.create).mockResolvedValue(persisted)
    vi.mocked(email.sendInvitation).mockResolvedValue({
      success: false,
      error: "Resend down",
    })
    vi.mocked(invitations.recordSendFailure).mockResolvedValue(persisted)

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      email: "invitee@example.com",
      roles: ["member"],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailSent).toBe(false)
    expect(result.emailError).toBe("Resend down")
    expect(invitations.recordSendFailure).toHaveBeenCalledWith(INVITATION_UUID, "Resend down")
  })

  it("returns 409 when an active invitation already exists for the (tenant, email) pair", async () => {
    vi.mocked(invitations.getActiveByEmail).mockResolvedValue(makePersistedInvitation())

    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      email: "invitee@example.com",
      roles: ["member"],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(409)
    expect(invitations.create).not.toHaveBeenCalled()
    expect(email.sendInvitation).not.toHaveBeenCalled()
  })

  it("returns 400 when actor has no active tenant", async () => {
    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: { ...ACTOR, activeTenantId: null },
      email: "invitee@example.com",
      roles: ["member"],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(invitations.create).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid email format", async () => {
    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      email: "not-an-email",
      roles: ["member"],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(invitations.create).not.toHaveBeenCalled()
  })

  it("returns 400 on empty roles array", async () => {
    const result = await useCase.execute({
      client: FAKE_CLIENT,
      actor: ACTOR,
      email: "invitee@example.com",
      roles: [],
      acceptUrlBase: "https://app.example.com",
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
  })
})
