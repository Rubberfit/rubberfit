# admin/members/

Admin-only Members & Invitations surface — ARC-25 onboarding half.
Lives at `/dashboard/admin/members`. Gated on `manageMembers` via
[`ROUTE_PERMISSIONS`](../../../../src/application/permissions.ts) and
the page's own `requirePermission(actor, "manageMembers")` server-side
check. Distinct from `/dashboard/users` (cross-tenant user admin) —
this surface manages the **membership** of the current active tenant.

## Files

- **page.tsx** — RSC entry. `requireAuthenticatedUser` →
  `requirePermission("manageMembers")` → loads tenant name +
  member roster + pending invitations in parallel via `Promise.all`.
  Composes the three client components below under a `<PageHeader>`.

## \_components/

- **invite-member-form.tsx** — Email input + role checkboxes
  (defaults to `["member"]`). Submits to the `inviteMember`
  server action. Toasts on success; warns when the email
  dispatch failed but the row landed (admin can still resend).
- **pending-invitations-table.tsx** — `<DataTable>` with email +
  roles + expiry + last-attempt + created columns. Per-row
  Resend / Revoke buttons wired to `resendInvitation` /
  `revokeInvitation` actions. Confirm dialog on revoke; spinner
  on the active row. Surfaces `last_send_error` inline so the
  admin can see why an email bounced.
- **members-table.tsx** — Read-only `<DataTable>`: name + email +
  roles + joined date. Sourced from `loadTenantMembers` in
  `active-tenant.service.ts` (joins `memberships → profiles` via
  the explicit `memberships_profile_id_fkey` to avoid the
  PostgREST ambiguity from the two FKs to `profiles`).

## Server actions

All four invitation actions live in
[`app/actions/invitations.ts`](../../../actions/invitations.ts).
Three are admin-gated (`manageMembers`); `acceptInvitation` is
auth-only (the token IS the authorization).

| Action | Permission | Use case |
|--------|------------|----------|
| `inviteMember` | `manageMembers` | `CreateInvitationUseCase` |
| `resendInvitation` | `manageMembers` | `ResendInvitationUseCase` |
| `revokeInvitation` | `manageMembers` | `RevokeInvitationUseCase` |
| `acceptInvitation` | (auth only) | `AcceptInvitationUseCase` |

## Backed by

Two SECURITY DEFINER Postgres RPCs handle the brand-new-user
RLS gap (an invitee with zero memberships can't pass the
invitations write check):

- `accept_invitation(p_token)` — atomic accept (invitation
  status flip + memberships INSERT in one transaction). Custom
  SQLSTATEs `P0001`-`P0006` map to typed reasons in
  `AcceptInvitationUseCase`.
- `get_invitation_by_token(p_token)` — public-safe lookup for
  the `/invite/[token]` landing page. Granted to `anon` +
  `authenticated`; returns tenant name + invited email + roles
  + expiry without admin-only fields.

Migrations: `20260515000001_accept_invitation_rpc.sql` and
`20260515000002_invitation_lookup_rpc.sql`.

## Public counterpart

Recipients land on [`app/invite/[token]/page.tsx`](../../../invite),
which is on the `PUBLIC_PATHS` allowlist in
`src/middleware/auth-allowlist.ts`. The public page uses
`getOptionalUser()` (sibling of `requireAuthenticatedUser` —
membership-free) to branch on signed-in state without bouncing
brand-new invitees as "Account deactivated".

## Why a separate route from /dashboard/users

`/dashboard/users` is the legacy cross-tenant user admin surface
(uses `manageUsers` permission). `/dashboard/admin/members` is the
**tenant-scoped membership** surface introduced with ARC-25's
multi-tenant model — invite by email, manage the current tenant's
roster. The two stay distinct so role grants stay clean and the
audiences don't collide.

## Tests

Use-case tests cover happy paths + each error branch:
`tests/use-cases/invitations/{create,resend,revoke,accept}-invitation.use-case.test.ts`
(25 tests total). The page itself is RSC-only — no component
tests yet; manual smoke covers the integration.
