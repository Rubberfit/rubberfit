# admin/security/

Admin-only Security & Audit surface — Phase 2 PR 5. Lives at
`/dashboard/admin/security` (NOT `/dashboard/security`, which is
the customer-facing Trust & Security page that stays ungated for
procurement reviewers). Gated on `manageUsers` via
`ROUTE_PERMISSIONS` and the page's own `useRole().isAdmin` check.

## Files

- **page.tsx** — Composes the four sections under a `<PageHeader>`.
  Renders the Access-restricted fallback for non-admins.

## \_components/

- **mock-data.ts** — Hero metrics, audit events, role/permission
  matrix shape. Every fixture carries a `TODO(ARC-DASHBOARD-AUDIT)`
  marker so the cleanup pass can swap in real data.
- **metrics-hero.tsx** — Four `<StatCard>` tiles (active sessions,
  MFA enrollment %, audit events 7d, failed logins 24h).
- **access-policy-section.tsx** — MFA-required switch + session
  timeout select with per-section dirty state + Sonner toast.
- **roles-matrix-section.tsx** — Read-only role × permission
  matrix derived from the canonical `PERMISSIONS` map in
  `src/application/permissions.ts`.
- **audit-log-section.tsx** — `<DataTable>` with severity column
  (`<StatusDot>` intent mapping) over the audit fixtures.

## Out of scope (PR 5)

- **Real wiring** — sessions table, MFA enforcement flag, real
  `audit_log`, edit-mode role matrix all stay mocked. Backend
  wiring tracked under `TODO(ARC-DASHBOARD-AUDIT)`.
- **Server-side audit filtering / export** — UI shows the recent
  fixture set; pagination, severity filter, and CSV export ship
  with the data wiring.

## Why a separate route from /dashboard/security

`/dashboard/security` is the customer-facing Trust & Security
surface (FAQ + trust signals + DPA contact). Every claim there is
cite-grounded against migrations and `proxy.ts`. We keep that
public-readable for procurement reviewers and split admin work to
`/dashboard/admin/` so the two audiences stay distinct.
