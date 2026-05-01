# Documented Security Decisions — rema-portal

ASVS 5.0 mandates that certain security decisions be **documented** so that the implementation can be verified against the documentation. This file is that record. It is referenced from [asvs-5.0-checklist.md](asvs-5.0-checklist.md).

This file is filled in during Phase A audits. Sections marked **TBD** will be completed as audits surface evidence.

---

## Authorization model (V8.1.1, V8.1.2)

### Roles

Defined in [src/application/permissions.ts](../../src/application/permissions.ts):

- `admin` — full access (system administration, user management, RBAC editing).
- `manager` — operational management (POs, suppliers, pricing, reorder rules).
- `supervisor` — production supervision (cuts, rolls, cutting engine).
- `cutter` — operates cutting engine; restricted in some areas.
- `member` — read-most, write-limited.
- `viewer` — read-only.

### Permission matrix

The full matrix is the source code in `src/application/permissions.ts`. Any change to the matrix is a security-relevant change and must be reviewed.

### Function-level enforcement points

- **App router pages**: `canAccessPath()` in `app/lib/rbac.ts`.
- **API routes — admin**: `requireAdmin()` in `app/api/admin/_lib/require-admin.ts`.
- **API routes — non-admin**: per-route auth check using Supabase server client.
- **Database**: Postgres RLS policies in `src/infrastructure/supabase/migrations/`.

### Data-level enforcement (V8.2.2 / IDOR-BOLA)

**TBD** — will be filled in after Phase A1 audit. Specifically:

- For each table containing user-scoped or role-scoped data, document the RLS policy that prevents cross-user/cross-role access.
- For routes using `makeAdminClient()` (RLS-bypass), document which in-route guard substitutes for RLS.

### Field-level enforcement (V8.1.2 / BOPLA)

**TBD** — will be filled in if any field-level access restrictions are required (e.g. PO `total_amount` visible to manager+ only). Default rule until specified: a user authorized for a row sees all columns of that row.

---

## Multi-tenancy (V8.4.1)

**Decision: rema-portal is a single-tenant application.** It is deployed once per customer organization. There is no cross-tenant isolation requirement at the application layer. V8.4.1 does not apply.

Evidence: no `organization_id` / `tenant_id` foreign keys in the schema (`src/infrastructure/supabase/migrations/`); all users belong to the same logical tenant.

---

## Authentication delegation (V6, V9, V10, V11)

### Delegated to Supabase Auth

The following are **out of app scope** because Supabase Auth is the system of record:

- Password storage (bcrypt hashing) — V6.2, V11.4.
- Password complexity policy — configured in Supabase Dashboard → Auth → Password Settings.
- TOTP MFA enrollment, secret storage, code verification — V6.5, V6.7.
- Account lockout after failed attempts — Supabase default.
- JWT issuance and signature — V9.1, V11.6.
- OAuth state, PKCE, code exchange — V10.1, V10.2, V10.5.
- Session token cookie (signing, expiry) — V7.

Verification approach: a single audit pass against the Supabase Dashboard configuration, screenshot referenced in the checklist. Not re-verified per-route.

### App-side responsibilities

- **Cookie attributes** — verify Supabase SSR cookies have `HttpOnly`, `Secure`, `SameSite=Lax` (or stricter). V3.3.
- **OAuth callback** (`app/(auth)/callback/route.ts`) — must validate the redirect URL against an allowlist before redirecting; must not echo arbitrary `next` query params.
- **Password reset / update** flows — must invalidate other sessions on password change (V7.4.3).
- **MFA enforcement policy** — admins should be required to enroll MFA. **TBD** — confirm policy decision and Supabase configuration to enforce it.

---

## Input validation rules (V2.1.1)

**TBD** — Phase A4 deliverable. For each entity, this section will list:

- Field name, allowed type, length bound, allowed pattern, special rules.

Initial entities to document:
- `Roll` (CSV import primary use case)
- `PurchaseOrder` (line items, totals, supplier reference)
- `Cut` (geometric inputs, customer reference)
- `Supplier` (contact info, address)
- `User` (admin-set role, profile fields)

Until this section is filled, route-level Zod schemas are the authoritative validation. The audit will check coverage and completeness.

---

## Business logic limits (V2.1.3)

**TBD** — will be populated with per-user and global limits as discovered:

- Max PO line items per PO.
- Max rolls importable per CSV.
- Max concurrent cuts per user.
- Anti-automation rate limits per route (V2.4.1).

---

## External services (V13.1.1)

The application initiates outbound connections to:

| Service | Purpose | Auth | SSRF risk |
|---|---|---|---|
| Supabase REST + Postgres + Storage | Primary data layer | Anon key (RLS-bound) + Service role key (RLS-bypass) | Low — fixed origin. |
| Resend API | Email delivery | API key | Low — fixed origin. |
| Google OAuth | Identity (via Supabase) | Brokered through Supabase | Low. |
| Tax API | PO tax calculation | **TBD** — verify auth mechanism | Medium — review allowlist. |
| Vision/OCR API | Document extraction | **TBD** | Medium — review allowlist. |

End-user-controllable destinations: **none currently identified.** If any feature accepts a URL from the user (e.g. webhook config), it must be added here and gated by an allowlist (V13.2.4).

---

## Secrets inventory (V13.3.1, V13.3.4)

| Secret | Storage | Rotation policy | Notes |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel env var | **TBD** | Bypasses all RLS; highest-impact secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env var (public) | On Supabase project key rotation | Embedded in client bundle by design. |
| `RESEND_API_KEY` | Vercel env var | **TBD** | |
| Google OAuth client secret | Supabase project config | Per Google policy | Not in app env. |
| Tax API credential | **TBD** | | |
| Vision API credential | **TBD** | | |

Full env var inventory will be reconciled against `.env.example` during Phase A2.

---

## Logging & observability decisions (V16)

**Phase B deliverable.** Placeholder for:

- Which events are security-relevant and must be logged (logins, MFA challenges, role changes, admin actions, PO/cut state transitions, failed authz checks).
- PII redaction rules (no full email addresses in logs; no full request bodies).
- Log retention policy.
- Where logs are written (Vercel runtime logs, external SIEM, Supabase audit log).

---

## Cookie attributes decision (V3.3)

**Phase B deliverable.** Placeholder for:

- Supabase SSR session cookie: HttpOnly = ?, Secure = ?, SameSite = ?, prefix (`__Host-` / `__Secure-`) = ?.
- Any other cookies set by the app (CSRF tokens, preference cookies).

---

## Session timeout decision (V7.3)

**Phase B deliverable.** Placeholder for:

- Idle timeout (minutes).
- Absolute timeout (hours/days).
- Re-authentication required for sensitive operations (payment? role change? user creation?).

---

## File handling decisions (V5.1.1)

For each file feature in the app:

### CSV roll import (`/api/v2/import/rolls/csv`)

- **Permitted MIME types**: `text/csv` (only).
- **Permitted extensions**: `.csv`.
- **Max file size**: **TBD** — propose 5 MB.
- **Max rows**: **TBD** — propose 10,000.
- **Charset**: UTF-8; reject other encodings.
- **Behavior on malicious file**: reject with HTTP 400 and a generic message; log details server-side only.

### Cut history PDF generation (output)

- Generated server-side; not user-uploaded. V5.2 N/A.
- Storage: Supabase Storage bucket — verify ACL prevents public listing (V5.3).
- Download: through `/api/cuts/history/[id]/pdf` with route-level authz (V5.4).
