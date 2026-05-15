import "reflect-metadata"
import { randomBytes, randomUUID } from "node:crypto"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { APP_CONFIG } from "@/config/app-config"
import { TOKENS } from "@/di/tokens"
import type { AppRole } from "@/src/application/permissions"
import type { IEmailService } from "@/src/application/services/email.service.interface"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"
import type { InvitationSnapshot } from "@/src/entities/invitation"
import { Email } from "@/src/entities/value-objects/email"
import {
  InvitationId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"
import { loadTenantName } from "@/src/infrastructure/services/active-tenant.service"

const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface CreateInvitationInput {
  client: SupabaseClient
  actor: ActionActor
  email: string
  roles: AppRole[]
  /**
   * Origin-only base URL (no trailing slash needed). The use case
   * builds `${acceptUrlBase}/invite/${token}` for the email body.
   * Action layer provides this from `process.env.NEXT_PUBLIC_APP_URL`
   * so the use case stays framework-free.
   */
  acceptUrlBase: string
}

export interface CreateInvitationSuccess {
  ok: true
  invitation: InvitationSnapshot
  emailSent: boolean
  emailError: string | null
}

export interface CreateInvitationFailure {
  ok: false
  status: 400 | 409
  error: string
}

export type CreateInvitationResult =
  | CreateInvitationSuccess
  | CreateInvitationFailure

export interface ICreateInvitationUseCase {
  execute(input: CreateInvitationInput): Promise<CreateInvitationResult>
}

/**
 * Generate a 32-byte hex invitation token. The InvitationToken VO
 * normalizes case + validates length/charset.
 */
function generateToken(): InvitationToken {
  return InvitationToken.create(randomBytes(32).toString("hex"))
}

/**
 * Cross-aggregate use case: persists an Invitation, then dispatches
 * the email synchronously and records the send outcome on the same
 * row (so admins see `lastSendError` in the pending-invitations
 * table). Send failure does NOT roll back the insert — the admin can
 * resend without re-typing the email.
 */
@injectable()
export class CreateInvitationUseCase implements ICreateInvitationUseCase {
  constructor(
    @inject(TOKENS.IInvitationService)
    private readonly invitations: IInvitationService,
    @inject(TOKENS.IEmailService)
    private readonly email: IEmailService
  ) {}

  async execute(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    if (!input.actor.activeTenantId) {
      return { ok: false, status: 400, error: "No active tenant" }
    }
    if (input.roles.length === 0) {
      return { ok: false, status: 400, error: "At least one role is required" }
    }

    let emailVo: Email
    try {
      emailVo = Email.create(input.email)
    } catch (err) {
      return { ok: false, status: 400, error: (err as Error).message }
    }

    const tenantId = TenantId.fromPersistence(input.actor.activeTenantId)
    const invitedBy = ProfileId.fromPersistence(input.actor.id)

    const existing = await this.invitations.getActiveByEmail(
      input.actor.activeTenantId,
      emailVo.value
    )
    if (existing) {
      return {
        ok: false,
        status: 409,
        error: `${emailVo.value} already has an active invitation for this workspace`,
      }
    }

    const tenantName =
      (await loadTenantName(input.client, input.actor.activeTenantId)) ??
      "your workspace"

    const expiresAt = new Date(
      Date.now() + APP_CONFIG.INVITATION_EXPIRY_DAYS * MS_PER_DAY
    )
    const id = InvitationId.create(randomUUID())
    const token = generateToken()

    const entity = await this.invitations.create({
      id,
      tenantId,
      email: emailVo,
      roles: input.roles,
      token,
      expiresAt,
      invitedBy,
    })

    const acceptUrl = `${input.acceptUrlBase.replace(/\/$/, "")}/invite/${token.value}`

    const sendResult = await this.email.sendInvitation({
      to: emailVo.value,
      tenantName,
      inviterName: input.actor.email,
      acceptUrl,
      expiresAt,
      roles: input.roles,
    })

    const final = sendResult.success
      ? await this.invitations.recordSendSuccess(entity.id.value)
      : await this.invitations.recordSendFailure(
          entity.id.value,
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
