import "reflect-metadata"
import { inject, injectable } from "tsyringe"

import { TOKENS } from "@/di/tokens"
import type { IInvitationService } from "@/src/application/services/invitation.service.interface"
import type { ActionActor } from "@/src/application/types/action-actor"

export interface AcceptInvitationInput {
  actor: ActionActor
  token: string
}

export type AcceptInvitationFailureReason =
  | "not_found"
  | "already_accepted"
  | "revoked"
  | "expired"
  | "email_mismatch"
  | "unknown"

export interface AcceptInvitationSuccess {
  ok: true
  membershipId: string
  tenantId: string
}

export interface AcceptInvitationFailure {
  ok: false
  status: 400 | 404 | 409
  reason: AcceptInvitationFailureReason
  error: string
}

export type AcceptInvitationResult = AcceptInvitationSuccess | AcceptInvitationFailure

export interface IAcceptInvitationUseCase {
  execute(input: AcceptInvitationInput): Promise<AcceptInvitationResult>
}

/**
 * Postgres SQLSTATE codes raised by the accept_invitation RPC. Kept
 * private to this module — the repo throws the raw PostgrestError;
 * the use case maps to a typed reason here.
 */
const PG_CODE_MAP: Record<string, { reason: AcceptInvitationFailureReason; status: 404 | 409 }> = {
  P0002: { reason: "not_found", status: 404 },
  P0003: { reason: "already_accepted", status: 409 },
  P0004: { reason: "revoked", status: 409 },
  P0005: { reason: "expired", status: 409 },
  P0006: { reason: "email_mismatch", status: 409 },
}

interface PostgrestLikeError {
  code?: string
  message?: string
}

function isPostgrestLikeError(err: unknown): err is PostgrestLikeError {
  return typeof err === "object" && err !== null && ("code" in err || "message" in err)
}

/**
 * Cross-aggregate accept: thin wrapper around the
 * IInvitationService.acceptByToken passthrough, with error
 * discrimination so the page layer can render reason-specific empty
 * states ("expired", "revoked", "wrong account").
 *
 * The RPC handles the actual atomic work. P0001 ("auth required")
 * shouldn't reach here — requireAuthenticatedUser fails earlier — but
 * it's mapped to the unknown bucket as a defense-in-depth path.
 */
@injectable()
export class AcceptInvitationUseCase implements IAcceptInvitationUseCase {
  constructor(
    @inject(TOKENS.IInvitationService)
    private readonly invitations: IInvitationService
  ) {}

  async execute(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    if (!input.token) {
      return {
        ok: false,
        status: 400,
        reason: "not_found",
        error: "Missing token",
      }
    }

    try {
      const result = await this.invitations.acceptByToken(input.token)
      return {
        ok: true,
        membershipId: result.membershipId,
        tenantId: result.tenantId,
      }
    } catch (err) {
      if (isPostgrestLikeError(err) && err.code && PG_CODE_MAP[err.code]) {
        const mapped = PG_CODE_MAP[err.code]
        return {
          ok: false,
          status: mapped.status,
          reason: mapped.reason,
          error: err.message ?? mapped.reason,
        }
      }
      return {
        ok: false,
        status: 409,
        reason: "unknown",
        error: isPostgrestLikeError(err) ? (err.message ?? "Accept failed") : "Accept failed",
      }
    }
  }
}
