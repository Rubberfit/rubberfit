import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { InvitationSnapshot } from "@/src/entities/invitation"

export interface RevokeInvitationInput {
  actor: ActionActor
  invitationId: string
}

export interface RevokeInvitationSuccess {
  ok: true
  invitation: InvitationSnapshot
}

export interface RevokeInvitationFailure {
  ok: false
  status: 400 | 404 | 409
  error: string
}

export type RevokeInvitationResult =
  | RevokeInvitationSuccess
  | RevokeInvitationFailure

export interface IRevokeInvitationUseCase {
  execute(input: RevokeInvitationInput): Promise<RevokeInvitationResult>
}

/**
 * Cancel a pending invitation. Idempotent on already-revoked rows.
 * Refuses to revoke an accepted invitation (the membership is already
 * live — the admin must remove the membership instead, which is out
 * of scope for this slice).
 */
@injectable()
export class RevokeInvitationUseCase implements IRevokeInvitationUseCase {
  constructor(
    @inject(TOKENS.IInvitationService)
    private readonly invitations: IInvitationService
  ) {}

  async execute(input: RevokeInvitationInput): Promise<RevokeInvitationResult> {
    if (!input.actor.activeTenantId) {
      return { ok: false, status: 400, error: "No active tenant" }
    }

    let invitation
    try {
      invitation = await this.invitations.getById(input.invitationId)
    } catch {
      return { ok: false, status: 404, error: "Invitation not found" }
    }

    if (invitation.tenantId.value !== input.actor.activeTenantId) {
      return { ok: false, status: 404, error: "Invitation not found" }
    }

    if (invitation.isAccepted) {
      return {
        ok: false,
        status: 409,
        error: "Invitation already accepted — remove the membership instead",
      }
    }

    try {
      const final = await this.invitations.revoke(invitation.id.value)
      return { ok: true, invitation: final.toJSON() }
    } catch (err) {
      return { ok: false, status: 409, error: (err as Error).message }
    }
  }
}
