import { describe, expect, it, vi } from "vitest"

import { ResendInvitationUseCase } from "@/src/application/use-cases/team/resend-invitation.use-case"
import type { IEmailService } from "@/src/application/services/email.service.interface"
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
    // Freeze time so the ISO format produces an exact string. Frozen at
    // 2026-01-20T12:00Z; resend expiry = +7 days → 2026-01-27 →
    // yyyy-MM-dd = "2026-01-27".
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-20T12:00:00.000Z"))
      const original = makeInvitation({ token: "tok_original" })
      const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: original })
      const sendInvitationEmail = vi.fn<IEmailService["sendInvitationEmail"]>(async () => ({
        success: true,
        messageId: "msg_test",
      }))
      const fakeEmail = makeFakeEmailService({ sendInvitationEmail })
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
      const sentParams = sendInvitationEmail.mock.lastCall?.[0]
      expect(sentParams?.expiresAtLabel).toBe("2026-01-27")
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to default formatting when org-prefs lookup throws (still resends)", async () => {
    // Same frozen clock. Default `dateFormat` is MM/dd/yyyy → "01/27/2026".
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-20T12:00:00.000Z"))
      const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: makeInvitation() })
      const sendInvitationEmail = vi.fn<IEmailService["sendInvitationEmail"]>(async () => ({
        success: true,
        messageId: "msg_test",
      }))
      const fakeEmail = makeFakeEmailService({ sendInvitationEmail })
      const fakePrefs = makeFakeOrgPreferencesService({
        getForOrganization: vi.fn(async () => {
          throw new Error("rls denied")
        }),
      })
      const useCase = new ResendInvitationUseCase(fakeOrg, fakeEmail, fakePrefs)

      const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })

      expect(result).toEqual({ ok: true })
      const sentParams = sendInvitationEmail.mock.lastCall?.[0]
      expect(sentParams?.expiresAtLabel).toBe("01/27/2026")
    } finally {
      vi.useRealTimers()
    }
  })
})
