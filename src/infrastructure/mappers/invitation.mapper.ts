import type { AppRole } from "@/src/application/permissions"
import { Invitation } from "@/src/entities/invitation"
import { Email } from "@/src/entities/value-objects/email"
import {
  InvitationId,
  ProfileId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { InvitationToken } from "@/src/entities/value-objects/invitation-token"

/**
 * Persistence shape for the `invitations` table — mirrors the columns
 * defined in `src/infrastructure/supabase/migrations/20260509000001_invitations.sql`.
 *
 * The table has no `updated_at` / `updated_by`. Mutation timestamps
 * (`accepted_at`, `revoked_at`, `last_send_attempt_at`) carry the audit
 * story.
 */
export interface InvitationRow {
  id: string
  tenant_id: string
  email: string
  roles: AppRole[]
  token: string
  expires_at: string
  invited_by: string | null
  accepted_at: string | null
  revoked_at: string | null
  last_send_attempt_at: string | null
  last_send_error: string | null
  created_at: string
}

/**
 * Insert shape. Terminal-state and send-attempt columns are omitted —
 * they are always null on insert per the entity's `create` factory and
 * are populated only via subsequent `update` calls.
 */
export interface InvitationInsertRow {
  id: string
  tenant_id: string
  email: string
  roles: AppRole[]
  token: string
  expires_at: string
  invited_by: string | null
}

/**
 * Update shape. Limited to the columns that mutate after insert:
 * terminal-state timestamps and send-attempt tracking. Immutable
 * identity / payload columns never appear here.
 *
 * `accepted_at` is included for completeness even though the canonical
 * accept path is the `accept_invitation` Postgres RPC; admin-side
 * tooling (manual close-out, tests) may still use the entity's
 * `markAccepted` + `update` round-trip.
 */
export type InvitationUpdateRow = Partial<
  Pick<
    InvitationRow,
    "accepted_at" | "revoked_at" | "last_send_attempt_at" | "last_send_error"
  >
>

export function rowToInvitation(row: InvitationRow): Invitation {
  return Invitation.reconstitute({
    id: InvitationId.fromPersistence(row.id),
    tenantId: TenantId.fromPersistence(row.tenant_id),
    email: Email.fromPersistence(row.email),
    roles: row.roles,
    token: InvitationToken.fromPersistence(row.token),
    expiresAt: new Date(row.expires_at),
    invitedBy: row.invited_by ? ProfileId.fromPersistence(row.invited_by) : null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    lastSendAttemptAt: row.last_send_attempt_at
      ? new Date(row.last_send_attempt_at)
      : null,
    lastSendError: row.last_send_error,
    createdAt: new Date(row.created_at),
  })
}

export function invitationToInsertRow(entity: Invitation): InvitationInsertRow {
  return {
    id: entity.id.value,
    tenant_id: entity.tenantId.value,
    email: entity.email.value,
    roles: [...entity.roles],
    token: entity.token.value,
    expires_at: entity.expiresAt.toISOString(),
    invited_by: entity.invitedBy?.value ?? null,
  }
}

export function invitationToUpdateRow(entity: Invitation): InvitationUpdateRow {
  return {
    accepted_at: entity.acceptedAt?.toISOString() ?? null,
    revoked_at: entity.revokedAt?.toISOString() ?? null,
    last_send_attempt_at: entity.lastSendAttemptAt?.toISOString() ?? null,
    last_send_error: entity.lastSendError,
  }
}
