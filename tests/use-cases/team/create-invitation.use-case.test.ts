import { describe, expect, it, vi } from "vitest"

import { CreateInvitationUseCase } from "@/src/application/use-cases/team/create-invitation.use-case"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import { DEFAULT_ORGANIZATION_PREFERENCES } from "@/src/infrastructure/models/organization-preferences"

import {
  ACTOR_OWNER,
  ORG_ID,
  makeFakeEmailService,
  makeFakeOrgPreferencesService,
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
    const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail, makeFakeOrgPreferencesService())

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
      const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, makeFakeEmailService(), makeFakeOrgPreferencesService())
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
    const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail, makeFakeOrgPreferencesService())
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

  it("formats the invitation expiry label with the operator's date prefs", async () => {
    // Freeze time to a date where day≠month so dd/MM/yyyy vs MM/dd/yyyy
    // produce visibly different strings. Frozen at 2026-01-20T12:00Z;
    // invitation expiry = +7 days → 2026-01-27 → dd/MM/yyyy = "27/01/2026".
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-20T12:00:00.000Z"))
      const fakeOrg = makeFakeOrganizationService({ role: "owner" })
      const sendInvitationEmail = vi.fn<IEmailService["sendInvitationEmail"]>(async () => ({
        success: true,
        messageId: "msg_test",
      }))
      const fakeEmail = makeFakeEmailService({ sendInvitationEmail })
      // Operator runs with EU date format (dd/MM/yyyy). The use-case
      // should resolve via IOrganizationPreferencesService and pass an
      // EU-shaped `expiresAtLabel` to the email service.
      const getForOrganization = vi.fn(async () => ({
        ...DEFAULT_ORGANIZATION_PREFERENCES,
        organizationId: ORG_ID,
        dateFormat: "dd/MM/yyyy" as const,
        createdAt: "2026-05-10T00:00:00.000Z",
        updatedAt: "2026-05-10T00:00:00.000Z",
      }))
      const fakePrefs = makeFakeOrgPreferencesService({ getForOrganization })
      const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail, fakePrefs)

      await useCase.execute({
        organizationId: ORG_ID,
        email: "new@example.com",
        role: "member",
        actor: ACTOR_OWNER,
      })

      expect(getForOrganization).toHaveBeenCalledWith(ORG_ID)
      const sentParams = sendInvitationEmail.mock.lastCall?.[0]
      expect(sentParams?.expiresAtLabel).toBe("27/01/2026")
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to default date formatting when org-prefs lookup throws", async () => {
    // Same frozen clock as above. Default `dateFormat` is MM/dd/yyyy →
    // expiry = 2026-01-27 → "01/27/2026". The exact string distinguishes
    // the fallback path from the EU-prefs path above.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-20T12:00:00.000Z"))
      const fakeOrg = makeFakeOrganizationService({ role: "owner" })
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
      const useCase = new CreateInvitationUseCase(fakeOrg, fakeEmail, fakePrefs)

      const result = await useCase.execute({
        organizationId: ORG_ID,
        email: "new@example.com",
        role: "member",
        actor: ACTOR_OWNER,
      })

      // Lookup failure does NOT block invitation send.
      expect(result).toHaveProperty("invitationId")
      const sentParams = sendInvitationEmail.mock.lastCall?.[0]
      expect(sentParams?.expiresAtLabel).toBe("01/27/2026")
    } finally {
      vi.useRealTimers()
    }
  })
})
