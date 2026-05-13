import { describe, expect, it } from "vitest"

import { RevokeInvitationUseCase } from "@/src/application/use-cases/team/revoke-invitation.use-case"

import {
  ACTOR_OWNER,
  INVITATION_ID,
  makeFakeOrganizationService,
  makeInvitation,
} from "./_fixtures"

describe("RevokeInvitationUseCase", () => {
  it("marks the invitation revoked when caller is owner", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      invitation: makeInvitation(),
    })
    const useCase = new RevokeInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ ok: true })
    expect(fakeOrg.updateInvitation).toHaveBeenCalledWith(
      INVITATION_ID,
      expect.objectContaining({ status: "revoked" })
    )
  })

  it("returns not_found when invitation is missing", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", invitation: null })
    const useCase = new RevokeInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_found" })
  })

  it("returns not_pending when invitation is already accepted", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      invitation: makeInvitation({ status: "accepted" }),
    })
    const useCase = new RevokeInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "not_pending" })
  })

  it("returns forbidden when caller is a member", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "member",
      invitation: makeInvitation(),
    })
    const useCase = new RevokeInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "forbidden" })
  })

  it("blocks an admin from revoking an admin-role invitation (owner-only)", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "admin",
      invitation: makeInvitation({ role: "admin" }),
    })
    const useCase = new RevokeInvitationUseCase(fakeOrg)
    const result = await useCase.execute({ invitationId: INVITATION_ID, actor: ACTOR_OWNER })
    expect(result).toEqual({ error: "forbidden" })
  })
})
