import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IOrganizationService } from "@/src/application/services/organization.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export type AcceptInvitationError =
  | "not_found"
  | "expired"
  | "already_accepted"
  | "revoked"
  | "email_mismatch"
  | "org_subscription_inactive"
  | "membership_exists"
  | "accept_failed"

export interface AcceptInvitationInput {
  token: string
  actor: ActionActor
}

export type AcceptInvitationResult =
  | { organizationId: string; membershipId: string }
  | { error: AcceptInvitationError }

export interface IAcceptInvitationUseCase {
  execute(input: AcceptInvitationInput): Promise<AcceptInvitationResult>
}

@injectable()
export class AcceptInvitationUseCase implements IAcceptInvitationUseCase {
  constructor(
    @inject(TOKENS.IOrganizationService)
    private readonly organizationService: IOrganizationService
  ) {}

  async execute(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const token = input.token.trim()
    if (token.length === 0) return { error: "not_found" }
    if (!input.actor.email) return { error: "email_mismatch" }

    let outcome
    try {
      outcome = await this.organizationService.acceptInvitationAtomically({
        token,
        actorId: input.actor.id,
        actorEmail: input.actor.email,
        acceptedAt: new Date().toISOString(),
      })
    } catch (err) {
      console.error("acceptInvitationAtomically failed", err)
      return { error: "accept_failed" }
    }

    if (outcome.result_code === "ok") {
      return {
        organizationId: outcome.organization_id,
        membershipId: outcome.membership_id,
      }
    }

    return { error: outcome.result_code }
  }
}
