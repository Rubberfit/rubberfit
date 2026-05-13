import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type RevokeInvitationError = "not_found" | "not_pending" | "forbidden"

export interface RevokeInvitationInput {
  invitationId: string
  actor: ActionActor
}

export type RevokeInvitationResult = { ok: true } | { error: RevokeInvitationError }

export interface IRevokeInvitationUseCase {
  execute(input: RevokeInvitationInput): Promise<RevokeInvitationResult>
}

@injectable()
export class RevokeInvitationUseCase implements IRevokeInvitationUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService
  ) {}

  async execute(input: RevokeInvitationInput): Promise<RevokeInvitationResult> {
    const invitation = await this.organizationService.getInvitationById(input.invitationId)
    if (!invitation) return { error: "not_found" }
    if (invitation.status !== "pending") return { error: "not_pending" }

    const actorRole = await this.organizationService.getMemberRole(
      invitation.organization_id,
      input.actor.id
    )
    if (actorRole !== "owner" && actorRole !== "admin") return { error: "forbidden" }

    // Admins cannot revoke owner-issued admin invites; preserves the
    // admin-invite owner monopoly from create-invitation.
    if (invitation.role === "admin" && actorRole !== "owner") return { error: "forbidden" }

    await this.organizationService.updateInvitation(invitation.id, {
      status: "revoked",
      revoked_at: new Date().toISOString(),
    })

    return { ok: true }
  }
}
