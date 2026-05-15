import { describe, expect, it, vi } from "vitest"

import { ResendInvitationUseCase } from "@/src/application/use-cases/team/resend-invitation.use-case"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"

import {
  ACTOR_OWNER,
  INVITATION_ID,
  makeFakeEmailService,
  makeFakeOrgPreferencesService,
  makeFakeOrganizationService,
  makeInvitation,
} from "./_fixtures"

describe("ResendInvitationUseCase", () => {
  it("bumps expiry, reuses the original token, and resends the email", async () => {
    const original = makeInvitation({ token: "tok_original" })
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: original })
    const fakeEmail = makeFakeEmailService()
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail, makeFakeOrgPreferencesService())

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
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_found" })
  })

  it("returns not_pending when invitation is revoked", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      invitation: makeInvitation({ status: "revoked" }),
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_pending" })
  })

  it("returns forbidden when caller is a member", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "member",
      invitation: makeInvitation(),
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail, makeFakeOrgPreferencesService())
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "invite_email_failed" })
  })

  it("formats the new expiry label with the operator's date prefs", async () => {
    const original = makeInvitation({ token: "tok_original" })
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: original })
    const fakeEmail = makeFakeEmailService()
    const getForOrganization = vi.fn(async () => ({
      ...DEFAULT_ORGANIZATION_PREFERENCES,
      organizationId: original.organization_id,
      dateFormat: "yyyy-MM-dd" as const,
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    }))
    const fakePrefs = makeFakeOrgPreferencesService({ getForOrganization })
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail, fakePrefs)

    await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })

    expect(getForOrganization).toHaveBeenCalledWith(original.organization_id)
    const sendCall = (fakeEmail.sendInvitationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    const params = sendCall?.[0]
    expect(params?.expiresAtLabel).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("falls back to default formatting when org-prefs lookup throws (still resends)", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: makeInvitation() })
    const fakeEmail = makeFakeEmailService()
    const fakePrefs = makeFakeOrgPreferencesService({
      getForOrganization: async () => {
        throw new Error("rls denied")
      },
    })
    const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail, fakePrefs)

    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })

    expect(result).toEqual({ ok: true })
    const sendCall = (fakeEmail.sendInvitationEmail as ReturnType<typeof vi.fn>).mock.calls[0]
    const params = sendCall?.[0]
    expect(params?.expiresAtLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
  })
})
