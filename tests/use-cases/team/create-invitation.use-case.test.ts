import { describe, expect, it } from "vitest"

import { CreateInvitationUseCase } from "@/src/application/use-cases/team/create-invitation.use-case"

import {
  ACTOR_OWNER,
  ORG_ID,
  makeFakeEmailService,
  makeFakeOrganizationService,
  makeInvitation,
  makeMemberWithProfile,
  makeSeatUsage,
} from "./_fixtures"

describe("CreateInvitationUseCase", () => {
  it("creates a pending invite and emails the invitee on happy path", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      seatUsage: makeSeatUsage({ available: 3 }),
    })
    const fakeEmail = makeFakeEmailService()
    const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail)

    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "new@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })

    expect(result).toHaveProperty("invitationId")
    expect(fakeOrg.createInvitation).toHaveBeenCalled()
    expect(fakeEmail.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "new@example.com",
        role: "member",
      })
    )
  })

  it.each(["", "no-at", "no-domain@", "@no-local", "spaces in @example.com"])(
    "rejects invalid email %j",
    async (email) => {
      const fakeOrg = makeFakeOrganizationService({ role: "owner" })
      const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
      const result = await useCase.execute({
        organizationId: ORG_ID,
        email,
        role: "member",
        actor: ACTOR_OWNER,
      })
      expect(result).toEqual({ error: "invalid_email" })
    }
  )

  it("rejects email_too_long", async () => {
    const longLocal = "a".repeat(250)
    const fakeOrg = makeFakeOrganizationService({ role: "owner" })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: `${longLocal}@example.com`,
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "email_too_long" })
  })

  it("returns forbidden when actor is not admin/owner", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "member" })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "new@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "forbidden" })
  })

  it("blocks admin role escalation by an admin caller (owner-only)", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "admin" })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "new@example.com",
      role: "admin",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "role_not_allowed" })
  })

  it("returns already_member when email matches an active member", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      members: [
        makeMemberWithProfile({
          profile: {
            id: "u1",
            email: "existing@example.com",
            full_name: "Existing",
            avatar_url: null,
          },
        }),
      ],
    })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "EXISTING@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "already_member" })
  })

  it("returns duplicate_pending_invite when one already exists for the email", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      pending: [makeInvitation({ email: "dupe@example.com" })],
    })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "dupe@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "duplicate_pending_invite" })
  })

  it("returns seat_cap_reached when there are no available seats", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      seatUsage: makeSeatUsage({ available: 0 }),
    })
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "new@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "seat_cap_reached" })
  })

  it("revokes the invite and returns invite_email_failed when email send fails", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner" })
    const fakeEmail = makeFakeEmailService()
    ;(
      fakeEmail.sendInvitationEmail as ReturnType<typeof import("vitest").vi.fn>
    ).mockResolvedValueOnce({
      success: false,
      error: "smtp down",
    })
    const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      email: "new@example.com",
      role: "member",
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "invite_email_failed" })
    expect(fakeOrg.updateInvitation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: "revoked" })
    )
  })
})
