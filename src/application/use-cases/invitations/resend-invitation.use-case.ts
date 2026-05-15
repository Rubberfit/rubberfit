import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { InvitationSnapshot } from "@/src/entities/invitation"
import { loadTenantName } from "@/src/infrastructure/services/active-tenant.service"

export interface ResendInvitationInput {
  client: SupabaseClient
  actor: ActionActor
  invitationId: string
  acceptUrlBase: string
}

export interface ResendInvitationSuccess {
  ok: true
  invitation: InvitationSnapshot
  emailSent: boolean
  emailError: string | null
}

export interface ResendInvitationFailure {
  ok: false
  status: 400 | 404 | 409
  error: string
}

export type ResendInvitationResult = ResendInvitationSuccess | ResendInvitationFailure

export interface IResendInvitationUseCase {
  execute(input: ResendInvitationInput): Promise<ResendInvitationResult>
}

/**
 * Re-dispatch the email for a still-active invitation. Refuses
 * accepted, revoked, or expired invitations (the admin should revoke
 * + invite fresh in those cases). Updates `last_send_attempt_at` and
 * `last_send_error` regardless of outcome so the pending-invitations
 * table reflects reality.
 */
@injectable()
export class ResendInvitationUseCase implements IResendInvitationUseCase {
  constructor(
    @inject(TOKENS.IInvitationService)
    private readonly invitations: IInvitationService,
    @inject(TOKENS.IEmailService)
    private readonly email: IEmailService
  ) {}

  async execute(input: ResendInvitationInput): Promise<ResendInvitationResult> {
    if (!input.actor.activeTenantId) {
      return { ok: false, status: 400, error: "No active tenant" }
    }

    let invitation
    try {
      invitation = await this.invitations.getById(input.invitationId)
    } catch {
      return { ok: false, status: 404, error: "Invitation not found" }
    }

    // Tenant scoping — RLS would block cross-tenant reads, but defend
    // explicitly here so the error surfaces as 404 not 500.
    if (invitation.tenantId.value !== input.actor.activeTenantId) {
      return { ok: false, status: 404, error: "Invitation not found" }
    }

    if (invitation.isAccepted) {
      return { ok: false, status: 409, error: "Invitation already accepted" }
    }
    if (invitation.isRevoked) {
      return { ok: false, status: 409, error: "Invitation has been revoked" }
    }
    if (invitation.isExpired()) {
      return {
        ok: false,
        status: 409,
        error: "Invitation has expired — revoke and re-invite",
      }
    }

    const tenantName =
      (await loadTenantName(input.client, input.actor.activeTenantId)) ?? "your workspace"

    const acceptUrl = `${input.acceptUrlBase.replace(/\/$/, "")}/invite/${invitation.token.value}`

    const sendResult = await this.email.sendInvitation({
      to: invitation.email.value,
      tenantName,
      inviterName: input.actor.email,
      acceptUrl,
      expiresAt: invitation.expiresAt,
      roles: [...invitation.roles],
    })

    const final = sendResult.success
      ? await this.invitations.recordSendSuccess(invitation.id.value)
      : await this.invitations.recordSendFailure(
          invitation.id.value,
          sendResult.error ?? "Unknown send error"
        )

    return {
      ok: true,
      invitation: final.toJSON(),
      emailSent: sendResult.success,
      emailError: sendResult.error ?? null,
    }
  }
}
