import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type ResendInvitationError =
  | "not_found"
  | "not_pending"
  | "forbidden"
  | "invite_email_failed"

const INVITE_EXPIRY_DAYS = 7

export interface ResendInvitationInput {
  invitationId: string
  actor: ActionActor
}

export type ResendInvitationResult = { ok: true } | { error: ResendInvitationError }

export interface IResendInvitationUseCase {
  execute(input: ResendInvitationInput): Promise<ResendInvitationResult>
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "https://app.rubberfit.com"
}

@injectable()
export class ResendInvitationUseCase implements IResendInvitationUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IEmailService)
    private readonly emailService: IEmailService
  ) {}

  async execute(input: ResendInvitationInput): Promise<ResendInvitationResult> {
    const invitation = await this.organizationService.getInvitationById(input.invitationId)
    if (!invitation) return { error: "not_found" }
    if (invitation.status !== "pending") return { error: "not_pending" }

    const actorRole = await this.organizationService.getMemberRole(
      invitation.organization_id,
      input.actor.id
    )
    if (actorRole !== "owner" && actorRole !== "admin") return { error: "forbidden" }
    if (invitation.role === "admin" && actorRole !== "owner") return { error: "forbidden" }

    const newExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    // Reuse the original token so any unread copy of the prior email still
    // works. Bump only the expiry.
    await this.organizationService.updateInvitation(invitation.id, {
      expires_at: newExpiresAt.toISOString(),
    })

    const organization = await this.organizationService.getOrganizationById(
      invitation.organization_id
    )
    const organizationName = organization?.name ?? "your team"
    const inviteUrl = `${appUrl()}/invite/${invitation.token}`

    const send = await this.emailService.sendInvitationEmail({
      to: invitation.email,
      organizationName,
      role: invitation.role,
      inviterName: input.actor.email ?? null,
      inviteUrl,
      expiresAt: newExpiresAt,
    })

    if (!send.success) return { error: "invite_email_failed" }
    return { ok: true }
  }
}
