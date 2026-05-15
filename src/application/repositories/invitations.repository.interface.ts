import type { Invitation } from "@/src/entities/invitation"

/**
 * Invitation persistence boundary — entity-typed surface for the
 * `invitations` table. Reads return hydrated `Invitation` aggregates;
 * writes accept the entity and stamp persistence shape via the mapper.
 *
 * Token lookup (`findByToken`) returns `null` on miss rather than
 * throwing because the public accept page (`/invite/[token]`) treats a
 * stale or fabricated token as a friendly empty state, not an error.
 * `findById` matches the cut-history convention and throws on miss.
 *
 * The state-transition update (`accept`) is intentionally NOT on this
 * interface — accept lives inside the `accept_invitation` Postgres RPC
 * so the invitation update + membership insert happen in one
 * transaction. The repo's `update` is for revoke + send-attempt
 * recording only.
 */
export interface IInvitationsRepository {
  /** Returns the entity for `id`, or throws if not found. */
  findById(id: string): Promise<Invitation>

  /**
   * Returns the entity matching `token`, or `null` if no row exists.
   * Active/expired/revoked checks live in the entity (`isActive()`) so
   * the page-layer can distinguish the not-found case from the
   * terminal-state case.
   */
  findByToken(token: string): Promise<Invitation | null>

  /**
   * Returns the active (not accepted, not revoked) invitation for the
   * `(tenantId, email)` pair, or `null` if none. Used by the create
   * action to surface "already invited" without re-inserting and
   * tripping the partial unique index.
   */
  findActiveByEmail(tenantId: string, email: string): Promise<Invitation | null>

  /**
   * All non-terminal invitations for `tenantId`, newest first by
   * `created_at`. Backs the admin members page's "pending" table.
   */
  listPendingByTenant(tenantId: string): Promise<Invitation[]>

  /**
   * Persists a freshly-built `Invitation` entity. Re-reads via
   * `findById` so DB defaults (`created_at`) round-trip.
   */
  insert(entity: Invitation): Promise<Invitation>

  /**
   * Persists state-transition mutations (`revoke`, `recordSendSuccess`,
   * `recordSendFailure`). Updates only the timestamp + error columns;
   * the immutable identity / payload columns are never touched after
   * insert.
   */
  update(entity: Invitation): Promise<Invitation>

  /**
   * Atomic accept via the `accept_invitation` Postgres RPC. Stamps
   * `accepted_at` and inserts (or resurrects) the memberships row in
   * one transaction. Throws PostgrestError with custom SQLSTATEs
   * P0001-P0006 for the validation failures (auth required, not found,
   * already accepted, revoked, expired, email mismatch); the use case
   * discriminates on `error.code`.
   *
   * Returns the freshly-created/updated membership id and the tenant
   * the user just joined — the action layer needs the tenant id to
   * set the `rema_active_tenant` cookie before redirecting.
   */
  acceptByToken(token: string): Promise<{ membershipId: string; tenantId: string }>
}
