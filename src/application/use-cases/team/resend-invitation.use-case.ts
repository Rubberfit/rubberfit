import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import { formatUserDate } from "@/src/application/preferences/user-date-format"
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
  // Prefer the server-only APP_URL so the invite host doesn't leak into the
  // client bundle. Falls back to NEXT_PUBLIC_APP_URL for compatibility with
  // existing dev/preview environments that only set the public variant.
  // `||` (not `??`) so an empty-string env value drops through to the next.
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://rubberfit.app"
  return raw.replace(/\/+$/, "")
}

@injectable()
export class ResendInvitationUseCase implements IResendInvitationUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IEmailService)
    private readonly emailService: IEmailService,
    @inject(TOKENS.IOrganizationPreferencesService)
    private readonly organizationPreferencesService: IOrganizationPreferencesService
  ) {}

  /**
   * Best-effort expiry-label formatter — same shape as the sibling
   * `CreateInvitationUseCase`. Prefs lookup failure falls back to
   * default date formatting so a transient DB hiccup never blocks a
   * legitimate resend.
   */
  private async formatExpiresAtLabel(organizationId: string, expiresAt: Date): Promise<string> {
    try {
      const prefs = await this.organizationPreferencesService.getForOrganization(organizationId)
      return formatUserDate(expiresAt, prefs)
    } catch (error) {
      console.error(
        `[resend-invitation] org-prefs lookup failed for organizationId=${organizationId}; falling back to default date formatting:`,
        error
      )
      return formatUserDate(expiresAt)
    }
  }

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

    const organization = await this.organizationService.getOrganizationById(
      invitation.organization_id
    )
    const organizationName = organization?.name ?? "your team"
    const inviteUrl = `${appUrl()}/invite/${invitation.token}`
    const expiresAtLabel = await this.formatExpiresAtLabel(invitation.organization_id, newExpiresAt)

    // Send the email first; persist the new expiry only if the send
    // succeeded. Otherwise the old invite stays in its original window
    // — we don't want a failed resend to silently extend the link.
    const send = await this.emailService.sendInvitationEmail({
      to: invitation.email,
      organizationName,
      role: invitation.role,
      inviterName: input.actor.email ?? null,
      inviteUrl,
      expiresAtLabel,
    })

    if (!send.success) return { error: "invite_email_failed" }

    // Reuse the original token so any unread copy of the prior email still
    // works. Bump only the expiry.
    await this.organizationService.updateInvitation(invitation.id, {
      expires_at: newExpiresAt.toISOString(),
    })
    return { ok: true }
  }
}
