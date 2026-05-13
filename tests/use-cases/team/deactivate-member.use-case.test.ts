import { describe, expect, it } from "vitest"

import { DeactivateMemberUseCase } from "@/src/application/use-cases/team/deactivate-member.use-case"

import {
  ACTOR_OWNER,
  ORG_ID,
  TARGET_MEMBER_ID,
  TARGET_USER_ID,
  makeFakeOrganizationService,
  makeMemberWithProfile,
} from "./_fixtures"

describe("DeactivateMemberUseCase", () => {
  it("deactivates an active member when caller is owner", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      members: [makeMemberWithProfile()],
    })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ ok: true })
    expect(fakeOrg.updateMember).toHaveBeenCalledWith(
      TARGET_MEMBER_ID,
      expect.objectContaining({ status: "deactivated" })
    )
  })

  it("returns forbidden for non-admin caller", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "member" })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "forbidden" })
  })

  it("returns member_not_found when member is not in the list", async () => {
    const fakeOrg = makeFakeOrganizationService({ role: "owner", members: [] })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "member_not_found" })
  })

  it("refuses to deactivate the owner", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      members: [makeMemberWithProfile({ role: "owner" })],
    })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "cannot_deactivate_owner" })
  })

  it("refuses to deactivate self", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      members: [
        makeMemberWithProfile({
          user_id: ACTOR_OWNER.id,
          id: TARGET_MEMBER_ID,
        }),
      ],
    })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "cannot_deactivate_self" })
  })

  it("returns not_active when target is already deactivated", async () => {
    const fakeOrg = makeFakeOrganizationService({
      role: "owner",
      members: [makeMemberWithProfile({ status: "deactivated", user_id: TARGET_USER_ID })],
    })
    const useCase = new DeactivateMemberUseCase(fakeOrg)
    const result = await useCase.execute({
      organizationId: ORG_ID,
      memberId: TARGET_MEMBER_ID,
      actor: ACTOR_OWNER,
    })
    expect(result).toEqual({ error: "not_active" })
  })
})
