import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type DeactivateMemberError =
  | "member_not_found"
  | "forbidden"
  | "cannot_deactivate_owner"
  | "cannot_deactivate_self"
  | "not_active"

export interface DeactivateMemberInput {
  organizationId: string
  memberId: string
  actor: ActionActor
}

export type DeactivateMemberResult = { ok: true } | { error: DeactivateMemberError }

export interface IDeactivateMemberUseCase {
  execute(input: DeactivateMemberInput): Promise<DeactivateMemberResult>
}

@injectable()
export class DeactivateMemberUseCase implements IDeactivateMemberUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService
  ) {}

  async execute(input: DeactivateMemberInput): Promise<DeactivateMemberResult> {
    const actorRole = await this.organizationService.getMemberRole(
      input.organizationId,
      input.actor.id
    )
    if (actorRole !== "owner" && actorRole !== "admin") return { error: "forbidden" }

    const members = await this.organizationService.listMembers(input.organizationId)
    const target = members.find((m) => m.id === input.memberId)
    if (!target) return { error: "member_not_found" }
    if (target.organization_id !== input.organizationId) return { error: "member_not_found" }
    if (target.role === "owner") return { error: "cannot_deactivate_owner" }
    if (target.user_id === input.actor.id) return { error: "cannot_deactivate_self" }
    if (target.status !== "active") return { error: "not_active" }

    await this.organizationService.updateMember(target.id, {
      status: "deactivated",
      deactivated_at: new Date().toISOString(),
    })

    return { ok: true }
  }
}
