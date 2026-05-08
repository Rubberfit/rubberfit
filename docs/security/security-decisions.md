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

Route-level Zod schemas are the authoritative validation surface
([ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141)). All
schemas use `.strict()` mode
([ARC-137](https://linear.app/arc-and-anchor/issue/ARC-137) / V8.2.3) —
unknown keys cause a 400, closing the BOPLA / mass-assignment path that
default Zod mode would otherwise leave open. The one exception is
`packRequestSchema` in [src/application/packing/types.ts](../../src/application/packing/types.ts),
which uses `.passthrough()` so optional Rust tuning knobs (mode, engine,
`*Strategy`, `timeBudgetMs`, …) can flow through without lockstep TS
maintenance — Rust's `serde` does the strict deserialise on its side.

| Route                            | Schema                 | Required fields and rules                                                                               |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| POST `/api/admin/users`          | `createUserBodySchema` | `email` (RFC 5322 via Zod), `password` (min 6 chars), `full_name` (trim, min 1), `roles?` (`AppRole[]`) |
| PATCH `/api/admin/alerts/[id]`   | `patchBodySchema`      | `action` (`"acknowledge" \| "resolve"`)                                                                 |
| POST `/api/cuts/favorites`       | `toggleBodySchema`     | `cut_history_id` (UUID v4)                                                                              |
| POST `/api/v2/pack` _(dev only)_ | `packRequestSchema`    | `bins` (≥1), `items` (array), `clearance` (≥0); `.passthrough()` for tuning fields (see above)          |

Bridge routes under `app/api/v2/**` (excluding `/pack`) defer
validation to the Rust backend. The architectural guard at
[tests/architecture/api-routes-validate-bodies.test.ts](../../tests/architecture/api-routes-validate-bodies.test.ts)
enforces this division: every write route either calls `.safeParse(...)`
on a Zod schema (which itself must be `.strict()` or documented
`.passthrough()`) or forwards to Rust via `forwardToRust(...)`. New
routes that try to skip both fail the test on commit.

Per-entity rules for the wider domain (`Roll`, `PurchaseOrder`, `Cut`,
`Supplier`) live with the writes themselves rather than with API
routes — they're enforced at the DB layer today (RLS, Postgres types,
CHECK constraints) and will gain server-action Zod gates as the
write-path migration tracked in
[ARC-216](https://linear.app/arc-and-anchor/issue/ARC-216) lands.

---

## Business logic limits (V2.1.3)

Limits enforced today via Zod on API routes
([ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141),
[ARC-137](https://linear.app/arc-and-anchor/issue/ARC-137)):

- POST `/api/admin/users`: `password` length ≥ 6 chars (historical
  baseline; tightening tracked under
  [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) / Phase C
  password policy).
- POST `/api/v2/pack`: at least one bin per request
  (`bins.array().min(1)`), `clearance` non-negative.

Limits **not yet enforced**, tracked separately:

- Max PO line items per PO — tracked with the PO domain migration
  ([ARC-216](https://linear.app/arc-and-anchor/issue/ARC-216) sub-bundle).
- Max rolls importable per CSV — tracked with the CSV migration
  ([ARC-216](https://linear.app/arc-and-anchor/issue/ARC-216) sub-bundle).
- Max concurrent cuts per user — TBD; not currently capped.
- Anti-automation rate limits per route (V2.4.1) —
  [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142).

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

| Concern                                  | Lives in                                                                                      | Why                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase SSR session cookie refresh      | `proxy.ts` (always)                                                                           | The Supabase `createServerClient` cookie adapter binds to `NextRequest` / `NextResponse`. The session refresh must happen before any handler reads the user. Documented exception in [`tests/architecture/no-direct-supabase.test.ts`](../../tests/architecture/no-direct-supabase.test.ts). |
| Auth allowlist (page-entry gate)         | `proxy.ts` + [`src/middleware/auth-allowlist.ts`](../../src/middleware/auth-allowlist.ts)     | Default-deny: any path not in `PUBLIC_PATHS` requires an authenticated session. Pages get a 302 to `/login?redirectTo=…`; APIs get 401 JSON.                                                                                                                                                 |
| Per-role permission gating               | `proxy.ts` (only for `/dashboard/*`, `/admin/*`)                                              | The matrix lives in [`src/application/permissions.ts`](../../src/application/permissions.ts); proxy looks up `getRequiredPermission(pathname)` and `access.isSuperAdmin`. Other paths only require authentication.                                                                           |
| Per-row authorization (BOLA / IDOR)      | Route handlers + Postgres RLS                                                                 | Proxy cannot make per-row decisions cheaply. Row-level checks stay where the data is loaded.                                                                                                                                                                                                 |
| Security response headers                | `proxy.ts` + [`src/middleware/security-headers.ts`](../../src/middleware/security-headers.ts) | Applied uniformly via `applySecurityHeaders()` on every response proxy returns. Kept in proxy (not `next.config.mjs` `headers()`) because future CSP nonces are per-request.                                                                                                                 |
| Rate limiting                            | **Not in proxy yet** — tracked in [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142)  | Proxy is the natural location once Upstash (or equivalent) is provisioned. Until then, no rate limiting at any layer.                                                                                                                                                                        |
| Structured request logging / audit trail | **Not in proxy yet** — tracked in Phase B / V16                                               | Will live in proxy once a logger is selected and `admin.admin_activity_log` consumption is wired.                                                                                                                                                                                            |
| `/api/tax-rates` lockdown                | Authenticated proxy — closed by [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134)    | Removed from `PUBLIC_PATHS`; proxy returns 401 for anonymous callers. Route also calls `requireAuthenticatedUser()` as defense-in-depth so allowlist drift can't silently re-expose the billed Ziptax key. Rate limiting (ARC-142) still pending as the second defense layer.                |

### Auth allowlist contents

Defined in [`src/middleware/auth-allowlist.ts`](../../src/middleware/auth-allowlist.ts) as the constant `PUBLIC_PATHS`. Matching is exact-or-sub-path (`/login` matches `/login`, `/login/`, `/login/sso`, but **not** `/loginadmin`).

| Path                                                                           | Reason                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/mfa-challenge` | User has no session yet by definition — these are the auth flows.                                    |
| `/callback`                                                                    | OAuth code-exchange. The session is finalized inside this handler.                                   |
| `/auth-email-logo`                                                             | Image embedded in transactional emails — must load without auth so recipients see it in their inbox. |

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

### Server actions ([ARC-147](https://linear.app/arc-and-anchor/issue/ARC-147))

Use-case orchestration runs through `app/actions/<domain>.ts` server actions, not browser-side `resolveUseCase` calls. The `"use server"` directive makes each export a hash-callable RPC endpoint; the orchestration boundary is enforced by the bundler, not by convention.

**Per-action auth check is mandatory.** Next.js [docs](https://nextjs.org/docs/app/api-reference/file-conventions/proxy#execution-order):

> Server Functions are not separate routes in this chain. They are handled as POST requests to the route where they are used, so a Proxy matcher that excludes a path will also skip Server Function calls on that path.

Action IDs ship in the client bundle and are callable by hash. `proxy.ts` gates page navigation but does NOT see action invocations. Every action's first lines are:

```typescript
const actor = await requireAuthenticatedUser()
requirePermission(actor, "manageRolls")
```

`requireAuthenticatedUser` (from `app/server/auth/require-authenticated-user.ts`) builds a cookie-bound `createServerClient`, calls `auth.getUser()`, and reads the caller's profile row in a single round-trip. It fails closed on missing profile (no `["member"]` default-grant), missing session, or `is_deleted = true` — the deactivation gap that `sign-in` checks but `getProfileAccess` historically did not.

**Error model.**

| Class               | Code           | HTTP-equivalent | When                                                                          |
| ------------------- | -------------- | --------------- | ----------------------------------------------------------------------------- |
| `UnauthorizedError` | `UNAUTHORIZED` | 401             | No session, missing profile, deactivated account, or profile-read RLS failure |
| `ForbiddenError`    | `FORBIDDEN`    | 403             | Authenticated but lacking the required permission                             |
| `AuthConfigError`   | `AUTH_CONFIG`  | 5xx             | Server misconfiguration (missing Supabase env vars)                           |

Catch wrappers discriminate on `code`, not `instanceof` — errors lose their prototype chain across the RPC boundary. Production messages are sanitized; full errors log server-side.

**Use-case input shape.** All write use-cases accept `actor: ActionActor` in their input. The action layer extracts the actor from `requireAuthenticatedUser()` and threads it through; client callers never provide it (`Omit<UseCaseInput, "actor">`). This:

- Eliminates the previous browser-side `getCurrentUserId()` lookup, which used the browser Supabase singleton and would silently fail in a server-action context.
- Gives the use-case body the caller's identity for downstream side effects (notifications, audit logging — see [ARC-31](https://linear.app/arc-and-anchor/issue/ARC-31)).
- Makes use-cases pure: tests register fake services and pass an actor, no global mocking.

**Cache invalidation.** Each action documents two surfaces:

- `revalidatePath(...)` — RSC and route-segment caches
- React Query `invalidateQueries({ queryKey: [...] })` — client-side cache, called from the hook after `await action(...)`

Forgetting either creates a stale-data bug. If the pattern starts showing drift, wrap actions in a helper that takes both as required params.

**Server vs. API route trade-off.** Actions for use-case orchestration; API routes (`app/api/**`) for external/Bearer-token entry points (e.g., the Rust API client paths and `app/api/internal/tax/po-preview/route.ts`). Actions don't replace API routes — they replace the browser-side `resolveUseCase` pattern.

### Database client resolution (RLS preserved end-to-end)

ARC-147 surfaced a real RLS bug: server actions resolved the actor correctly via cookies, then services wrote with the **browser-singleton** `supabase` (built from `createBrowserClient`, session in `localStorage`). On a Node runtime the singleton has no JWT, so Postgres saw `auth.uid() = NULL` and rejected every insert with `42501` even though the caller was signed in. The naïve fix would be a service-role bypass; we explicitly rejected that — service-role escapes are a last resort, and RLS is the security model.

The Phase 0 fix:

- **`src/infrastructure/supabase/get-database-client.ts`** exposes `getDatabaseClient()` and `registerServerDatabaseClientFactory(factory)`. Services call `await getDatabaseClient()` and get the right client for the runtime — a cookie-bound `createServerClient` server-side or the browser singleton client-side. Factory registration is **process-global, request-scoped at invocation**: the factory captures `next/headers cookies()` per-call, which Next.js threads via its own AsyncLocalStorage, so concurrent requests each see their own cookies.
- **`app/server/database/register-factory.ts`** owns the cookie-bound factory and exposes `ensureDatabaseFactoryRegistered()` (idempotent). Server actions call this as their first line. We deliberately do **not** register the factory as a `app/layout.tsx` side effect: per Codex review, Next.js does not contractually guarantee layout module evaluation before a server-action POST in serverless workers. Action-entry registration removes that risk.
- **No service-role bypass.** The factory uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`, identical to the browser client. RLS continues to enforce `auth.uid() = user_id`; the only difference is _where_ the JWT comes from (cookies on the server, localStorage in the browser). The service-role helpers in `src/infrastructure/supabase/server-clients.ts` (`makeAdminClient`) stay reserved for explicitly-authorized admin route handlers.
- **Migration scope.** Phase 0 migrated every infrastructure service reachable from the seven ARC-147 server actions: `purchaseOrderService`, `supplierService`, `reorderService`, `taxService`, `reorderCalculations`, `notificationService`, plus the `notifications.repository`. Methods that previously used `import { supabase }` now do `const supabase = await getDatabaseClient()` at the top of each method. The shape is identity-preserving for browser callers (the helper resolves the same singleton via dynamic import). Use-cases that need to write user-scoped rows (e.g., `updateReorderRule`) take `userId` from `actor.id` instead of relying on a browser-side `getCurrentUserId()` lookup.
- **Phase 1+** (follow-up tickets) migrates the remaining ~57 dashboard browser-direct callers off the singleton entirely, so all DB interactions route through the server.

### Architectural exceptions (`no-direct-supabase` allowlist)

The auth helper at `app/server/auth/require-authenticated-user.ts` constructs a cookie-bound `createServerClient` and reads `profiles` directly. The factory wrapper at `app/server/database/register-factory.ts` constructs a cookie-bound `createServerClient` (no `.from(...)` calls — only client construction). Both patterns are flagged by `tests/architecture/no-direct-supabase.test.ts`, so both files are in that test's `ALLOWLIST` alongside `proxy.ts` and `app/(auth)/callback/route.ts`. The `next/headers cookies()` binding is unavoidable in `app/`. Future cleanup: extend `getProfileAccess` in `authService.ts` to include `is_deleted`, then move the helper's profile read into that service so the action helper stays in `app/` without needing `.from('profiles')`.

### Pre-existing gaps tracked as follow-ups

- **`proxy.ts` deactivation hole — partial closure.** ARC-147 added an `access.isDeleted` check to `proxy.ts` inside the `requiredPermission || needsAdmin` branch (signs the user out, redirects to `/login?deactivated=1`). That covers every permission-gated route and every `/admin/*` path. The remaining gap is "deactivated user can hit unguarded authenticated paths (e.g., `/dashboard` root, `/dashboard/settings/profile`) until their cookie expires." Closing it fully needs either a profile load on every authenticated request (one extra DB round-trip per request — meaningful at scale) or refresh-token revocation on deactivation. Tracked separately.
- **`getCurrentUserId()` browser fallback in `purchaseOrderService`.** The service still falls back to the browser singleton `getCurrentUserId()` when callers don't pass `userId`. Action-path callers always pass it; legacy callers (e.g., `reorder-po-handlers.ts::handleCreateBulkPO`) keep the fallback. Once those callers migrate, `userId` becomes required and the fallback drops.
- **Next 16 server-action CSRF.** No `serverActions.allowedOrigins` config in `next.config.mjs`. Next 16 enforces same-origin by default; verify production hostnames before merge if a reverse proxy is in front of the app.
