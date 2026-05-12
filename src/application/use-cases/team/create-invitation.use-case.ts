import "reflect-metadata"
import { randomBytes } from "node:crypto"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type CreateInvitationError =
  | "forbidden"
  | "invalid_email"
  | "email_too_long"
  | "duplicate_pending_invite"
  | "already_member"
  | "seat_cap_reached"
  | "role_not_allowed"
  | "invite_email_failed"

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const INVITE_EXPIRY_DAYS = 7
const MAX_EMAIL_LENGTH = 255

export interface CreateInvitationInput {
  organizationId: string
  email: string
  role: "admin" | "member"
  actor: ActionActor
}

export type CreateInvitationResult = { invitationId: string } | { error: CreateInvitationError }

export interface ICreateInvitationUseCase {
  execute(input: CreateInvitationInput): Promise<CreateInvitationResult>
}

function appUrl(): string {
  // Prefer the server-only APP_URL so the invite host doesn't leak into the
  // client bundle. Falls back to NEXT_PUBLIC_APP_URL for compatibility with
  // existing dev/preview environments that only set the public variant.
  return (
    process.env.APP_URL?.trim() ??
    process.env.NEXT_PUBLIC_APP_URL?.trim() ??
    "https://rubberfit.app"
  )
}

function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

@injectable()
export class CreateInvitationUseCase implements ICreateInvitationUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService,
    @inject(TOKENS.IEmailService)
    private readonly emailService: IEmailService
  ) {}

  async execute(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const email = input.email.trim().toLowerCase()
    if (email.length === 0 || !EMAIL_PATTERN.test(email)) return { error: "invalid_email" }
    if (email.length > MAX_EMAIL_LENGTH) return { error: "email_too_long" }
    if (input.role !== "admin" && input.role !== "member") return { error: "role_not_allowed" }

    const actorRole = await this.organizationService.getMemberRole(
      input.organizationId,
      input.actor.id
    )
    if (actorRole !== "owner" && actorRole !== "admin") return { error: "forbidden" }

    // Owner-only admin invites: admins can only invite members.
    if (input.role === "admin" && actorRole !== "owner") return { error: "role_not_allowed" }

    const members = await this.organizationService.listMembers(input.organizationId)
    const existingMember = members.find(
      (m) => m.status === "active" && (m.profile?.email ?? "").toLowerCase() === email
    )
    if (existingMember) return { error: "already_member" }

    const pending = await this.organizationService.listPendingInvitations(input.organizationId)
    if (pending.some((i) => i.email.toLowerCase() === email)) {
      return { error: "duplicate_pending_invite" }
    }

    const usage = await this.organizationService.getSeatUsage(input.organizationId)
    if (usage.available <= 0) return { error: "seat_cap_reached" }

    const token = generateToken()
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

    const invitation = await this.organizationService.createInvitation({
      organization_id: input.organizationId,
      email,
      role: input.role,
      token,
      invited_by: input.actor.id,
      expires_at: expiresAt.toISOString(),
    })

    const inviteUrl = `${appUrl()}/invite/${token}`
    const organization = await this.organizationService.getOrganizationById(input.organizationId)
    const organizationName = organization?.name ?? "your team"
    const inviterName = input.actor.email ?? null

    const send = await this.emailService.sendInvitationEmail({
      to: email,
      organizationName,
      role: input.role,
      inviterName,
      inviteUrl,
      expiresAt,
    })

    if (!send.success) {
      // Revoke so the seat is not stranded on a never-deliverable invite.
      await this.organizationService.updateInvitation(invitation.id, {
        status: "revoked",
        revoked_at: new Date().toISOString(),
      })
      return { error: "invite_email_failed" }
    }

    return { invitationId: invitation.id }
  }
}
