import type { CreateInvitationProps, Invitation } from "@/src/entities/invitation"

/**
 * Entity-typed invitation service. Thin orchestrator over
 * `IInvitationsRepository` — reads return entities; writes go through
 * the entity's state-transition methods so domain invariants run
 * server-side.
 *
 * Conspicuously absent: a `markAccepted` method. Accept is a
 * cross-aggregate, cross-row mutation (invitation status flip +
 * memberships INSERT) and must be atomic; that lives in the
 * `accept_invitation` Postgres RPC and is invoked from
 * `AcceptInvitationUseCase`. Exposing a generic mark-accepted here
 * would tempt callers into a torn-state implementation.
 *
 * Authorization gating is also not here — it belongs to the
 * server-action layer (`requirePermission(actor, "manageMembers")`).
 * The service is pure orchestration.
 */
export interface IInvitationService {
  getById(id: string): Promise<Invitation>
  getByToken(token: string): Promise<Invitation | null>
  getActiveByEmail(tenantId: string, email: string): Promise<Invitation | null>
  listPending(tenantId: string): Promise<Invitation[]>

  create(props: CreateInvitationProps): Promise<Invitation>
  revoke(id: string): Promise<Invitation>
  recordSendSuccess(id: string): Promise<Invitation>
  recordSendFailure(id: string, error: string): Promise<Invitation>

  /**
   * Atomic accept — see IInvitationsRepository.acceptByToken. The
   * service is a passthrough; orchestration (cookie set, redirect)
   * happens in AcceptInvitationUseCase + the server action.
   */
  acceptByToken(token: string): Promise<{ membershipId: string; tenantId: string }>
}
