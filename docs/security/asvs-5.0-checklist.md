# OWASP ASVS 5.0 — Verification Checklist (rema-portal)

**Target level:** L2 (L1 + L2 in scope at this level)
**Date opened:** 2026-05-01
**Owner:** Arc and Anchor

Status legend:
- ✅ **Pass** — implemented and verifiable; evidence column cites file:line or Supabase config.
- ❌ **Fail** — gap; Linear issue filed (ID in evidence column).
- 🟡 **Partial** — partially implemented; Linear issue filed for the gap.
- ⏭️ **N/A** — does not apply; rationale in evidence column.
- ⏳ **Pending** — not yet audited.

Scope is locked in [asvs-5.0-applicability.md](asvs-5.0-applicability.md). Documented decisions referenced by these requirements live in [security-decisions.md](security-decisions.md).

This file currently lists **Phase A chapters (V2, V4, V8, V13)** in full. Phases B and C will be appended in subsequent engagements.

---

## V2 Validation and Business Logic · audited 2026-05-01

### V2.1 Validation and Business Logic Documentation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 2.1.1 | 1 | Documented input validation rules per data format. | ❌ | No central reference. Each route does ad-hoc inline checks; many use unsafe `as` casts (e.g. [cuts/history/route.ts:129](../../app/api/cuts/history/route.ts), [cuts/favorites/route.ts:66](../../app/api/cuts/favorites/route.ts), [v2/pack/route.ts:45](../../app/api/v2/pack/route.ts)). [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — populate [security-decisions.md](security-decisions.md) § "Input validation rules" per entity. |
| 2.1.2 | 2 | Documentation defines combined-field consistency. | ⏳ | Phase B. |
| 2.1.3 | 2 | Documented business logic limits (per-user and global). | ❌ | No documented limits (max PO line items, max CSV rows, max concurrent cuts, etc.). [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — define and document. |

### V2.2 Input Validation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 2.2.1 | 1 | Input validated via allowlist or structural checks. L2+: applies to *all* input. | ❌ | **Frontend forms** use Zod (12 components — login, register, forgot-password, reset-password, supplier-form, roll-form, job-form, user-form, etc.). **API routes do not** — only [admin/users/route.ts](../../app/api/admin/users/route.ts) does manual narrowing; cuts/favorites/pack/cuts-history-POST cast bodies via `as` without runtime checking. v2 routes forward raw bytes to the Rust backend, deferring validation there. [ARC-141](https://linear.app/arc-and-anchor/issue/ARC-141) — add Zod (or equivalent) schemas to all local-handling Next API routes. |
| 2.2.2 | 1 | Validation at trusted service layer, not client-only. | ✅ | Server-side checks exist in every route examined. Frontend Zod is convenience, not the gate. RLS at DB layer enforces tenant boundaries. |
| 2.2.3 | 2 | Combinations of related data items are reasonable. | ⏳ | Spot-checks pending — see V2.3.3 transaction handling. |

### V2.3 Business Logic Security

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 2.3.1 | 1 | Business flows execute in expected order. | 🟡 | PO state transitions enforced via DB CHECK constraints (`status NOT IN ('received', 'cancelled')` UPDATE policy in [migrations/20240219000009_create_rls_policies_phase2.sql:101](../../src/infrastructure/supabase/migrations/20240219000009_create_rls_policies_phase2.sql)). Cut status: 24-hour edit window in RLS policy. PASS at L1. [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — write the state-machine documentation. |
| 2.3.2 | 2 | Documented business logic limits enforced. | ❌ | Same root cause as V2.1.3. [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145). |
| 2.3.3 | 2 | Transactions complete fully or roll back. | ⏳ | RPC functions ([20260419000002_s3c_receive_purchase_order_rpc.sql](../../src/infrastructure/supabase/migrations/20260419000002_s3c_receive_purchase_order_rpc.sql), `20260419000003_s3c_create_reorder_purchase_order_rpc.sql`) likely wrap multi-row writes in transactions. Spot-verify pending. |
| 2.3.4 | 2 | Locking prevents double-booking limited resources. | ⏳ | Roll consumption / cut allocation — Phase B audit. |

### V2.4 Anti-automation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 2.4.1 | 2 | Anti-automation against excessive calls to costly/sensitive functions. | ❌ | No app-layer rate limiting on any route. Vercel may impose basic platform limits but they are not configured per-route or per-user. Costly/sensitive endpoints especially exposed: [tax-rates](../../app/api/tax-rates/route.ts) (anon Ziptax abuse — see F-V8-3), [v2/pack](../../app/api/v2/pack/route.ts) (300s budget × authenticated user can drain CPU), [v2/import/rolls/csv](../../app/api/v2/import/rolls/csv/route.ts) (large body parses), [admin/users](../../app/api/admin/users/route.ts) (user creation). [ARC-142](https://linear.app/arc-and-anchor/issue/ARC-142) — add rate limiting (Upstash, Vercel KV, or the Rust backend's existing limiter). |

---

## V4 API and Web Service · audited 2026-05-01

### V4.1 Generic Web Service Security

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 4.1.1 | 1 | Every HTTP response with body has Content-Type header with charset. | ✅ | `NextResponse.json()` sets `application/json; charset=utf-8` by default — used in 55 of 56 routes. Only one `new Response(...)` exists ([bridge.ts:188](../../app/api/v2/_lib/bridge.ts)) — it streams the upstream Rust response, preserving its `content-type` while stripping `content-encoding`/`transfer-encoding`/`content-length`/`connection` (correct behavior). |
| 4.1.2 | 2 | Only user-facing endpoints auto-redirect HTTP→HTTPS; APIs do not. | ✅ | Vercel terminates TLS at the edge. No in-app HTTP→HTTPS redirect logic in route handlers. The 8 redirects in [next.config.mjs](../../next.config.mjs) are IA-consolidation redirects on path, not protocol. |
| 4.1.3 | 2 | Intermediary headers cannot be overridden by end-user. | ✅ | No code reads `x-forwarded-*`, `x-real-ip`, or `x-user-id` from `request.headers`. Vercel sets/strips these at the edge per its standard behavior. |

### V4.2 HTTP Message Structure Validation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 4.2.1 | 2 | HTTP message boundaries (request smuggling defense). | ✅ | Vercel + Next.js handles HTTP message parsing per version. No HTTP/1.x → HTTP/2 conversion code in app. Documented as upstream-controlled in [security-decisions.md](security-decisions.md). |

### V4.3 GraphQL · ⏭️ N/A — no GraphQL endpoints.

### V4.4 WebSocket · ⏭️ N/A — no WebSocket endpoints.

---

## V8 Authorization · audited 2026-05-01

### V8.1 Authorization Documentation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 8.1.1 | 1 | Documentation defines function-level + data-specific access rules. | 🟡 | Permission matrix in [permissions.ts](../../src/application/permissions.ts) (function-level) + RLS policies (data-level). Single canonical document not yet assembled. [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — consolidate into `security-decisions.md`. |
| 8.1.2 | 2 | Documentation defines field-level access rules (read + write). | 🟡 | Only documented field-level rule: `profiles.super_admin` and `profiles.roles` cannot be self-modified ([20260322050232_update_profiles_multi_role.sql:99-101](../../src/infrastructure/supabase/migrations/20260322050232_update_profiles_multi_role.sql)). [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — document the explicit decision (likely "no further field-level masks required at L2"). |

### V8.2 General Authorization Design

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 8.2.1 | 1 | Function-level access restricted to consumers with explicit permission. | 🟡 | Pass on 55 of 56 routes. Admin routes use `requireAdmin` ([require-admin.ts](../../app/api/admin/_lib/require-admin.ts)), v2 routes use bridge bearer-token enforcement ([bridge.ts:126-129](../../app/api/v2/_lib/bridge.ts)), pack/users/cuts/internal-tax routes use explicit `auth.getUser()`, cron uses `CRON_SECRET`. **FAIL** — [tax-rates/route.ts](../../app/api/tax-rates/route.ts) has NO auth check (anonymous Ziptax API budget abuse). [ARC-134](https://linear.app/arc-and-anchor/issue/ARC-134). |
| 8.2.2 | 1 | Data-level access restricted (mitigates IDOR / BOLA). | ✅ | All 14 public-schema data tables enforce RLS with `auth.uid() = user_id` ([20240223000001_add_user_id_and_fix_rls.sql](../../src/infrastructure/supabase/migrations/20240223000001_add_user_id_and_fix_rls.sql)). New tables (jobs, job_parts, job_assignees, job_roll_allocations, cut_history_favorites) follow the same pattern. profiles uses `auth.uid() = id`. admin schema uses `admin.is_admin()`. Old `USING (true)` policies were dropped — earlier explorer-agent finding was based on superseded migrations. |
| 8.2.3 | 2 | Field-level write access restricted (mitigates BOPLA). | 🟡 | profiles `super_admin` and `roles` cannot be self-modified (good — prevents privilege escalation). PATCH routes elsewhere not yet audited for mass-assignment risk on PUT/PATCH bodies. [ARC-137](https://linear.app/arc-and-anchor/issue/ARC-137) — audit body shape against allowlist. |

### V8.3 Operation Level Authorization

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 8.3.1 | 1 | Authorization enforced at trusted service layer, not client JS. | ✅ | RLS at DB layer + route-level checks at API layer. UI-level `canAccessPath()` is convenience only, never the sole gate. |

### V8.4 Other Authorization Considerations

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 8.4.1 | 2 | Multi-tenant cross-tenant controls. | ⏭️ | N/A — single-tenant deployment. Documented in [security-decisions.md](security-decisions.md) § "Multi-tenancy". |

### V8 — Bonus findings (functional bugs surfaced during audit)

| Bug | Severity | Notes |
|---|---|---|
| [ARC-135](https://linear.app/arc-and-anchor/issue/ARC-135) | Medium | `cut_history` policy `cut_history_update_own` declared `FOR INSERT` (not UPDATE) at [20260412055559_add_cut_history.sql:31-33](../../src/infrastructure/supabase/migrations/20260412055559_add_cut_history.sql). No UPDATE policy exists, so RLS silently blocks all cut_history UPDATEs. Will surface as bugs whenever cut history corrections are attempted. |
| [ARC-143](https://linear.app/arc-and-anchor/issue/ARC-143) | Low | Two redundant DELETE policies on `cut_history` with identical USING clauses (`admins_managers_delete_cut_history` + `cut_history_delete_privileged`) at the same migration lines 49-60. Cleanup. |
| [ARC-144](https://linear.app/arc-and-anchor/issue/ARC-144) | Low | Original [20260412055550_create_cut_history.sql](../../src/infrastructure/supabase/migrations/20260412055550_create_cut_history.sql) enables RLS but creates no policies — relies on the follow-up migration. Out-of-order apply (e.g. partial replay) would lock the table. |

---

## V13 Configuration · audited 2026-05-01

### V13.1 Configuration Documentation

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 13.1.1 | 2 | All external communication needs documented (services + user-controllable destinations). | 🟡 | Inventory landed in [security-decisions.md](security-decisions.md) § "External services" — TBDs remaining for tax API + vision API auth mechanisms. [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — finalize. |

### V13.2 Backend Communication Configuration

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 13.2.1 | 2 | Backend-to-backend authenticated (no shared/static creds). | 🟡 | Resend: API key. Ziptax: API key. Rust backend (RF_API_URL): forwarded user JWT (good — per-call user context, not static). Supabase: service_role key (long-lived static — accepted Supabase pattern). Cron: shared CRON_SECRET (acceptable for cron). [ARC-145](https://linear.app/arc-and-anchor/issue/ARC-145) — document rotation policy for service_role and Resend key. |
| 13.2.2 | 2 | Backend connections use least-privilege accounts. | 🟡 | Service role key bypasses all RLS. 7 of 56 API routes use `makeAdminClient()` and rely on in-route role checks for authorization ([cuts/history](../../app/api/cuts/history/), [users](../../app/api/users/), [analytics/cut-history](../../app/api/analytics/cut-history/)). [ARC-136](https://linear.app/arc-and-anchor/issue/ARC-136) — audit each `makeAdminClient()` callsite to confirm in-route ownership filtering substitutes for the bypassed RLS. |
| 13.2.3 | 2 | No default credentials in use. | ✅ | Supabase keys are project-generated; no admin/admin patterns. |
| 13.2.4 | 2 | Allowlist for outbound destinations (SSRF defense). | ❌ | No app-layer outbound allowlist. Outbound calls go directly to Supabase, Resend, Ziptax, RF_API_URL, Slack webhook — all hardcoded so SSRF risk is low, but the application accepts no user-controlled URLs today. [ARC-140](https://linear.app/arc-and-anchor/issue/ARC-140) — add a documented SSRF posture (any future feature accepting URLs needs allowlist). |
| 13.2.5 | 2 | Web/app server has allowlist for resources it can load. | 🟡 | `next.config.mjs` `images.remotePatterns` allowlists Google/GitHub avatar hosts. No other server-side `fetch` allowlist. Acceptable given fixed outbound destinations. |

### V13.3 Secret Management

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 13.3.1 | 2 | Secrets in a vault, not in source/build artifacts. | ❌ | `.env*` is git-ignored ([.gitignore:18-23](../../.gitignore)) — no committed secrets. Vercel env vars provide vault. **However: [.env.example](../../.env.example) only lists 2 of ~13 server-side env vars** the app actually reads. Missing: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SENDER_EMAIL`, `REPLY_TO_EMAIL`, `ZIPTAX_API_KEY`, `RF_API_URL`, `CRON_SECRET`, `ADMIN_ALERT_EMAIL`, `SLACK_WEBHOOK_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `DEMO_USER_EMAIL`. New deployments cannot reproduce the env without out-of-band knowledge. [ARC-138](https://linear.app/arc-and-anchor/issue/ARC-138). |
| 13.3.2 | 2 | Access to secrets follows least privilege. | ⏳ | Vercel team/project access — out of band, not in code. Document in security-decisions. |

### V13.4 Unintended Information Leakage

| ID | L | Requirement | Status | Evidence / Notes |
|---|---|---|---|---|
| 13.4.1 | 1 | No `.git`/`.svn` deployed. | ✅ | Vercel build excludes; `.gitignore` excludes editor/lock files. |
| 13.4.2 | 2 | Debug modes off in production. | ✅ | [next.config.mjs:6](../../next.config.mjs) sets `removeConsole: NODE_ENV === "production"`. [app/lib/local-storage.client.ts:7](../../app/lib/local-storage.client.ts) gates dev-only logging. No `?debug=` flags found. |
| 13.4.3 | 2 | No directory listings. | ✅ | Next.js does not list directories. |
| 13.4.4 | 2 | HTTP TRACE not supported. | ✅ | Next.js route handlers only invoke exported method handlers (GET/POST/PUT/PATCH/DELETE). TRACE returns 405. |
| — | — | **Bonus**: Internal error detail in JSON response | ❌ | [app/api/v2/pack/route.ts:62-63](../../app/api/v2/pack/route.ts) returns `detail: message` from caught errors directly to client, leaking internal failure messages. Same pattern in `app/api/cuts/history/[id]/pdf/route.ts` and others. [ARC-139](https://linear.app/arc-and-anchor/issue/ARC-139). |

---

## Phase B / C placeholders

Sections for V1, V3, V5, V6, V7, V9, V10, V11, V12, V14, V15, V16 will be appended when those phases are scheduled. Out of scope at this phase: V17 (no WebRTC), V4.3 (no GraphQL), V4.4 (no WebSocket).
