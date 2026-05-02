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

| Service                            | Purpose                 | Auth                                                 | SSRF risk                  |
| ---------------------------------- | ----------------------- | ---------------------------------------------------- | -------------------------- |
| Supabase REST + Postgres + Storage | Primary data layer      | Anon key (RLS-bound) + Service role key (RLS-bypass) | Low — fixed origin.        |
| Resend API                         | Email delivery          | API key                                              | Low — fixed origin.        |
| Google OAuth                       | Identity (via Supabase) | Brokered through Supabase                            | Low.                       |
| Tax API                            | PO tax calculation      | **TBD** — verify auth mechanism                      | Medium — review allowlist. |
| Vision/OCR API                     | Document extraction     | **TBD**                                              | Medium — review allowlist. |

End-user-controllable destinations: **none currently identified.** If any feature accepts a URL from the user (e.g. webhook config), it must be added here and gated by an allowlist (V13.2.4).

---

## Secrets inventory (V13.3.1, V13.3.4)

| Secret                          | Storage                 | Rotation policy                  | Notes                                    |
| ------------------------------- | ----------------------- | -------------------------------- | ---------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY`     | Vercel env var          | **TBD**                          | Bypasses all RLS; highest-impact secret. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel env var (public) | On Supabase project key rotation | Embedded in client bundle by design.     |
| `RESEND_API_KEY`                | Vercel env var          | **TBD**                          |                                          |
| Google OAuth client secret      | Supabase project config | Per Google policy                | Not in app env.                          |
| Tax API credential              | **TBD**                 |                                  |                                          |
| Vision API credential           | **TBD**                 |                                  |                                          |

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

---

## Middleware architecture (V3, V8.3, V13.4) — ARC-146

The application uses a Next.js [proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) (formerly named `middleware.ts`; renamed in Next.js 16) at [`proxy.ts`](../../proxy.ts) to handle cross-cutting concerns that would otherwise have to be repeated in every route. This section documents which concerns live where, and why.

### Concern decision table

| Concern                                  | Lives in                                                                                           | Why                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase SSR session cookie refresh      | `proxy.ts` (always)                                                                                | The Supabase `createServerClient` cookie adapter binds to `NextRequest` / `NextResponse`. The session refresh must happen before any handler reads the user. Documented exception in [`tests/architecture/no-direct-supabase.test.ts`](../../tests/architecture/no-direct-supabase.test.ts). |
| Auth allowlist (page-entry gate)         | `proxy.ts` + [`src/middleware/auth-allowlist.ts`](../../src/middleware/auth-allowlist.ts)          | Default-deny: any path not in `PUBLIC_PATHS` requires an authenticated session. Pages get a 302 to `/login?redirectTo=…`; APIs get 401 JSON.                                                                                                                                                 |
| Per-role permission gating               | `proxy.ts` (only for `/dashboard/*`, `/admin/*`)                                                   | The matrix lives in [`src/application/permissions.ts`](../../src/application/permissions.ts); proxy looks up `getRequiredPermission(pathname)` and `access.isSuperAdmin`. Other paths only require authentication.                                                                           |
| Per-row authorization (BOLA / IDOR)      | Route handlers + Postgres RLS                                                                      | Proxy cannot make per-row decisions cheaply. Row-level checks stay where the data is loaded.                                                                                                                                                                                                 |
| Security response headers                | `proxy.ts` + [`src/middleware/security-headers.ts`](../../src/middleware/security-headers.ts)      | Applied uniformly via `applySecurityHeaders()` on every response proxy returns. Kept in proxy (not `next.config.mjs` `headers()`) because future CSP nonces are per-request.                                                                                                                 |
| Rate limiting                            | **Not in proxy yet** — tracked in [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142)       | Proxy is the natural location once Upstash (or equivalent) is provisioned. Until then, no rate limiting at any layer.                                                                                                                                                                        |
| Structured request logging / audit trail | **Not in proxy yet** — tracked in Phase B / V16                                                    | Will live in proxy once a logger is selected and `admin.admin_activity_log` consumption is wired.                                                                                                                                                                                            |
| `/api/tax-rates` lockdown                | **Allowlisted with FIXME** — tracked in [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134) | Currently anonymous; remains anonymous after this PR by being on the allowlist. ARC-134 decides the lockdown mechanism (auth, signed requests, or rate-limit-only) and removes the allowlist entry.                                                                                          |

### Auth allowlist contents

Defined in [`src/middleware/auth-allowlist.ts`](../../src/middleware/auth-allowlist.ts) as the constant `PUBLIC_PATHS`. Matching is exact-or-sub-path (`/login` matches `/login`, `/login/`, `/login/sso`, but **not** `/loginadmin`).

| Path                                                                           | Reason                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/mfa-challenge` | User has no session yet by definition — these are the auth flows.                                    |
| `/callback`                                                                    | OAuth code-exchange. The session is finalized inside this handler.                                   |
| `/auth-email-logo`                                                             | Image embedded in transactional emails — must load without auth so recipients see it in their inbox. |
| `/api/tax-rates`                                                               | FIXME (ARC-134). Currently anonymous Ziptax proxy.                                                   |

**Rule for adding entries:** every new entry is a security-relevant change and must be reviewed. The justification is committed in code as a comment next to the entry; no additional sign-off process beyond normal PR review, but reviewers should confirm the route legitimately needs to be public.

### Security headers

Sent on every proxy-handled response. Defined in [`src/middleware/security-headers.ts`](../../src/middleware/security-headers.ts).

| Header                                | Value                                                                                                                                                                                                                                                                                                                | Notes                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy-Report-Only` | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: <providers>; connect-src 'self' https://*.supabase.co wss://*.supabase.co; font-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none'` | Report-only initially. After a soak window, promotes to enforcing `Content-Security-Policy` with per-request nonces (no `'unsafe-inline'`/`'unsafe-eval'`). |
| `Strict-Transport-Security`           | `max-age=63072000; includeSubDomains; preload`                                                                                                                                                                                                                                                                       | Two years; meets HSTS preload list requirements.                                                                                                            |
| `X-Frame-Options`                     | `DENY`                                                                                                                                                                                                                                                                                                               | Legacy; `frame-ancestors 'none'` in CSP supersedes. Sent for older browsers / corporate proxies.                                                            |
| `X-Content-Type-Options`              | `nosniff`                                                                                                                                                                                                                                                                                                            |                                                                                                                                                             |
| `Referrer-Policy`                     | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                                                                    |                                                                                                                                                             |
| `Permissions-Policy`                  | `camera=(), microphone=(), geolocation=(), browsing-topics=()`                                                                                                                                                                                                                                                       | Disables features the app does not use.                                                                                                                     |

**Why CSP starts in Report-Only:** strict CSP with no `'unsafe-inline'` requires nonce wiring through the layout for every inline script and style. Next.js + React Compiler + Tailwind all currently emit inline content. Shipping enforcing CSP without that wiring blocks the app entirely. Report-Only lets us observe violations in production and fix them iteratively before promoting to enforce.

### Runtime + location

- **File location**: `proxy.ts` at the repo root (Next.js 16 file convention).
- **Runtime**: Node.js by default in Next.js 16. The `runtime` config option is no longer available for proxy (setting it throws). This is a change from the previous `middleware.ts` Edge default. Practical implications:
  - Service-role Supabase clients and `child_process` spawn are technically allowed in proxy now, but **kept out by convention** for separation of concerns and per-request cost. Those calls stay in route handlers.
  - On Vercel, proxy runs as a serverless function for matched requests, not at the edge. For a B2B internal app at modest traffic this is fine; if it becomes a hot path, revisit.

### Architectural trade-offs (ADR-style)

Three trade-offs worth recording:

1. **Default-deny matcher vs. explicit per-section matcher.** The matcher is `/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)` — every request flows through proxy, then the allowlist decides. The alternative (`/dashboard/:path*` + `/admin/:path*` only, the previous behavior) is narrower and lower-risk but leaves API routes unprotected at this layer. We chose default-deny because per-route auth is easy to forget; relying on every API author to remember `auth.getUser()` is the mistake [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134) caught. The allowlist is the audited single source of truth for what is intentionally public.

2. **Headers in proxy vs. `next.config.mjs` `headers()`.** Static headers could go in either place. We picked proxy because (a) the future CSP-with-nonces work will need per-request header generation, and (b) splitting headers across two configs invites drift. The cost is a small CPU hit on every matched response.

3. **`@supabase/ssr` cookie adapter inline in `proxy.ts` vs. extracted helper.** `createServerClient` is called directly in `proxy.ts` rather than wrapped in `src/infrastructure/supabase/`. This is the documented architectural exception (see [`tests/architecture/no-direct-supabase.test.ts`](../../tests/architecture/no-direct-supabase.test.ts) allowlist) — the cookie adapter is too tightly coupled to `NextRequest` / `NextResponse` to extract cleanly without leaking the request into a service interface.

### Server Functions caveat

Next.js [docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#execution-order) state:

> Server Functions are not separate routes in this chain. They are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path.

The app does not currently use server actions (`"use server"`). When/if they are introduced, **the auth check stays in the action body, not delegated to proxy alone.** A matcher refactor that moves a Server Function to a different route can silently remove proxy coverage. This rule is enforced by convention — Phase A's V8 work has the per-action authz pattern.
