import { describe, expect, it } from "vitest"

import { AcceptInvitationUseCase } from "@/src/application/use-cases/team/accept-invitation.use-case"

import { ACTOR_OWNER, ORG_ID, TARGET_MEMBER_ID, makeFakeOrganizationService } from "./_fixtures"

describe("AcceptInvitationUseCase", () => {
  it("returns organizationId + membershipId on RPC success", async () => {
    const fakeOrg = makeFakeOrganizationService({
      acceptResult: {
        result_code: "ok",
        organization_id: ORG_ID,
        membership_id: TARGET_MEMBER_ID,
      },
    })
    const useCase = new AcceptInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ token: "tok_test", actor: ACTOR_OWNER })

    expect(result).toEqual({ organizationId: ORG_ID, membershipId: TARGET_MEMBER_ID })
    expect(fakeOrg.acceptInvitationAtomically).toHaveBeenCalledWith({
      token: "tok_test",
      actorId: ACTOR_OWNER.id,
      actorEmail: ACTOR_OWNER.email,
      acceptedAt: expect.any(String),
    })
  })

  it("returns not_found when token is empty", async () => {
    const fakeOrg = makeFakeOrganizationService()
    const useCase = new AcceptInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ token: "   ", actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_found" })
    expect(fakeOrg.acceptInvitationAtomically).not.toHaveBeenCalled()
  })

  it("returns email_mismatch when actor has no email", async () => {
    const fakeOrg = makeFakeOrganizationService()
    const useCase = new AcceptInvitationUseCase(fakeOrg)
    const result = await useCase.execute({
      token: "tok_test",
      actor: { ...ACTOR_OWNER, email: "" },
    })
    expect(result).toEqual({ error: "email_mismatch" })
  })

  it.each([
    "not_found",
    "already_accepted",
    "revoked",
    "expired",
    "email_mismatch",
    "org_subscription_inactive",
    "membership_exists",
  ] as const)("surfaces %s from the RPC", async (code) => {
    const fakeOrg = makeFakeOrganizationService({
      acceptResult: { result_code: code },
    })
    const useCase = new AcceptInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ token: "tok", actor: ACTOR_OWNER })
    expect(result).toEqual({ error: code })
  })

  it("returns accept_failed when the service throws", async () => {
    const fakeOrg = makeFakeOrganizationService()
    fakeOrg.acceptInvitationAtomically.mockRejectedValueOnce(new Error("boom"))
    const useCase = new AcceptInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ token: "tok", actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "accept_failed" })
  })
})
