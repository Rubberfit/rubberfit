import { describe, expect, it, vi } from "vitest"

import { ResendInvitationUseCase } from "@/src/application/use-cases/team/resend-invitation.use-case"

import {
  ACTOR_OWNER,
  INVITATION_ID,
  makeFakeEmailService,
  makeFakeOrganizationService,
  makeInvitation,
} from "./_fixtures"

describe("ResendInvitationUseCase", () => {
  it("bumps expiry, reuses the original token, and resends the email", async () => {
    const original = makeInvitation({ token: "tok_original" })
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: original })
    const fakeEmail = makeFakeEmailService()
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail)

    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ ok: true })

    expect(fakeOrg.updateInvitation).toHaveBeenCalledTimes(1)
    const call = fakeOrg.updateInvitation.mock.calls[0]
    expect(call?.[0]).toBe(INVITATION_ID)
    expect(call?.[1]).toHaveProperty("expires_at")
    expect(call?.[1]).not.toHaveProperty("token")

    expect(fakeEmail.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: original.email,
        inviteUrl: expect.stringContaining("/invite/tok_original"),
      })
    )
  })

  it("returns not_found when invitation is missing", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: null })
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_found" })
  })

  it("returns not_pending when invitation is revoked", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      invitation: makeInvitation({ status: "revoked" }),
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_pending" })
  })

  it("returns forbidden when caller is a member", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "member",
      invitation: makeInvitation(),
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "forbidden" })
  })

  it("returns invite_email_failed when send fails (keeps invite pending)", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: makeInvitation() })
    const fakeEmail = makeFakeEmailService()
    ;(fakeEmail.sendInvitationEmail as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      error: "smtp down",
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "invite_email_failed" })
  })
})
