# S3 — Rust Backend Service + Supabase Port

**Status:** Design locked after parallel Gemini + Codex research on 2026-04-19 + user decisions on deployment/auth/write-routing.
**Predecessor:** `2026-04-18-s2.5-rust-engine-design.md` (S2.5 shipped; Rust nesting engine is production-ready).
**Parent:** `2026-04-17-migration-overview-design.md` — S3 row: "Port service/use-case layer; introduce entity layer; define the frontend-facing API."

## 1. Goal

Move REMA's business-layer compute from TypeScript into Rust. Keep Supabase as the persistence + auth layer. End state:

- **Desktop app (S4 Tauri)** — bundles the Rust backend (business logic + nesting engine). Full product.
- **Web CRM (Next.js on Vercel)** — MAX-tier web access. Job tracking, engineer orders, payroll, inventory views. No pack engine.
- **Cloud Rust backend (Fly.io)** — serves the web CRM. Same `rf-application` crate as desktop; pack endpoint not compiled in.

The product split mirrors a QuickBooks-style desktop-primary / web-premium model.

## 2. Stack decisions (locked)

### 2.1 HTTP framework: Axum

Both researchers converged on Axum + Tower. Tokio-native, matches the S2.5 Rust workspace's async model. `utoipa-axum` gives us OpenAPI. Critically, an Axum app reduces cleanly to a Tauri sidecar for S4 without rewriting handlers. Actix's actor model and marginal benchmark edge don't matter for REMA's request/response shape.

### 2.2 Supabase integration: PostgREST first, sqlx for privileged paths

Primary data path = **PostgREST** through a thin Rust client (`postgrest-rs` or `reqwest` + small in-house adapter). Forward the user's JWT verbatim: `Authorization: Bearer <user jwt>` + `apikey: <publishable key>`. This preserves the SAME RLS model the browser has today; no per-query session juggling.

`sqlx` stays as an option for:
- Privileged background jobs (notification dispatch, email queue workers).
- Migration-time utilities.
- Operations where PostgREST can't provide needed atomicity.

Codex correction over Gemini: **do not** use `sqlx` for request-scoped user queries. Manually recreating Supabase's JWT→RLS flow through `sqlx` connection pools is a known source of security bugs.

### 2.3 JWT verification: `jsonwebtoken` with JWKS + RS256

**Important correction over Gemini's initial recommendation:** Supabase's current auth stack uses asymmetric signing with JWKS-published keys. HS256 + anon key is legacy territory and should NOT be assumed.

- Crate: `jsonwebtoken` (supports JWK/JWKS natively).
- Fetch JWKS from `<project>.supabase.co/auth/v1/.well-known/jwks.json`, cache with TTL.
- Verify `alg=RS256`, `iss=<supabase issuer url>`, 30s clock leeway.
- Extract claims into `AuthContext { raw_jwt, claims }` and attach to every authenticated Axum request.

### 2.4 Wire type safety: `utoipa` (OpenAPI)

**Codex recommendation over Gemini's `ts-rs`:** for a real HTTP API contract, `utoipa` is the better choice.

- Rust DTOs annotated with `serde` + `utoipa::ToSchema`.
- `utoipa-axum` collects routes into a spec file.
- `openapi-typescript` converts the spec to TS types consumed by the Next.js frontend.
- CI diff on the spec catches route-level drift (not just field drift).

Trade-off: more annotation overhead than `ts-rs`. Pays off when we have >10 endpoints.

### 2.5 Auth model: Supabase sessions stay frontend-owned

**User decision:** Rust backend only **validates** access tokens. It does not issue them, does not refresh them, does not own session state.

Flow:
1. Browser/Tauri → Supabase Auth endpoint → access token + refresh token.
2. Browser/Tauri stores tokens locally.
3. Browser/Tauri sends `Authorization: Bearer <access token>` on every API call.
4. Rust backend validates via JWKS, rejects expired tokens with 401.
5. Client refreshes via Supabase Auth when it sees 401.

This avoids race conditions that would come from duplicating Supabase's refresh-token reuse-detection semantics in Rust.

### 2.6 Write routing: uniform through Rust via Next route handlers

**User decision:** all writes go `Browser → Next.js route handler → Rust backend → Supabase`. No direct browser-to-Supabase write paths.

**Not pure `next.config.mjs` rewrites (Codex sign-off correction).** The current frontend callers (e.g., `app/dashboard/history/_components/use-cut-history.ts`, `app/dashboard/cut-planner/page.tsx`) authenticate via Supabase session cookies, not `Authorization: Bearer` headers. `next.config.mjs` rewrites are transparent proxies — they cannot mint a bearer token from a cookie. Pure rewrites therefore cannot feed the Rust JWKS middleware, which requires a bearer token.

**Required pattern:** Next.js route handlers under `app/api/v2/<path>/route.ts`:
1. Read the Supabase session cookie server-side via `createServerClient` from `@supabase/ssr`.
2. Extract the user's access token from the session.
3. Forward the request upstream to Rust with `Authorization: Bearer <access_token>`.
4. Stream the response body back (preserves NDJSON / SSE semantics).
5. On 401 from Rust, trigger a client-side Supabase session refresh (handled by the Supabase auth provider).

Pros (why we picked this):
- Single audit surface for writes.
- Consistent authorization pattern.
- Route handlers can enforce per-request auth, idempotency keys (for non-idempotent writes in S3c), and feature flags (for `USE_RUST_<DOMAIN>` canarying).
- No mixed-pattern confusion (current codebase has both; Codex flagged as a drift source).
- Business rules run in exactly one place.

Reads: browser can still read directly from Supabase where RLS makes it safe (e.g., realtime subscriptions for live updates).

## 3. Crate architecture

```
engine/
├── crates/
│   ├── rf-geom/        (existing — geometry primitives)
│   ├── rf-layout/      (existing — nesting engine)
│   ├── pack-cli/         (existing — stdin/stdout adapter; retained through S3, retired in S4)
│   ├── rf-domain/      (NEW — entities + enums + business rules)
│   ├── rf-application/ (NEW — use-cases + port traits; transport-agnostic)
│   ├── rf-supabase/    (NEW — PostgREST client + JWKS + adapters IMPLEMENTING rf-application ports)
│   └── rf-api/         (NEW — Axum HTTP adapter; composes rf-application + rf-supabase)
```

**Dependency direction (Codex-locked, strict):**

- `rf-domain` has no dependencies beyond `serde` + `thiserror`. Pure business logic.
- `rf-application` depends ONLY on `rf-domain` + `serde` + `async-trait` + `thiserror`. **Forbidden**: `axum`, `tower`, `http`, `reqwest`, `jsonwebtoken`, `rf-supabase`, or any HTTP/JWT types. Ports are defined as traits here; implementations live elsewhere.
- `rf-supabase` depends on `rf-application` (so it can implement the port traits) + `rf-domain` + `reqwest` + `jsonwebtoken`.
- `rf-api` depends on `rf-application` + `rf-supabase` + `axum` + `utoipa`. This is the only crate that composes ports with implementations.

**Why this direction matters for S4 Tauri:** `rf-application` stays HTTP-free, so S4's Tauri command adapter can call use-cases directly without wrapping them in an HTTP client. Zero-hop for desktop users.

**Port wiring:** prefer `Arc<dyn Port + Send + Sync>` over compile-time generics on use-cases. These are I/O boundaries — `dyn` dispatch cost is irrelevant, compile times stay reasonable, and Axum/Tauri state wiring is simpler.

**JWKS placement:** JWKS fetching + JWT verification lives in `rf-supabase` under an auth-adapter module. Raw JWT strings / `jsonwebtoken::Claims` values never cross into `rf-application` — port APIs take domain-shaped actor identifiers (e.g., `UserId`, `TenantId`), not JWTs.

## 4. Deployment topology

### 4.1 Web CRM (MAX-tier users)

```
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌──────────────┐
│ Browser        │───→│ Next.js on     │───→│ rf-api on    │───→│ Supabase     │
│ (Vercel URL)   │    │ Vercel         │    │ Fly.io         │    │ PostgreSQL   │
│ job tracking   │    │ wrapper routes │    │ no engine      │    │              │
│ orders payroll │    │ /api/v2/*      │    │ ~$5-10/mo idle │    │              │
└────────────────┘    └────────────────┘    └────────────────┘    └──────────────┘
```

- Fly.io Docker deployment.
- Rust binary compiled without the `engine` feature — `/pack` endpoint is 404, not disabled.
- Vercel Next.js unchanged; adds `next.config.mjs` rewrite rules for `/api/v2/*` → `https://rf-api.fly.dev/*`.
- Single Supabase tenant shared with desktop.

### 4.2 Desktop app (S4 Tauri — out of S3 scope, but architecture anticipates it)

```
┌────────────────┐    ┌────────────────────────────────┐    ┌──────────────┐
│ Tauri UI       │───→│ Tauri sidecar: rf-api        │───→│ Supabase     │
│ (React/Vue)    │    │ WITH engine feature            │    │ PostgreSQL   │
│ full product   │    │ /pack endpoint compiled in     │    │              │
│ + nesting      │    │ embedded rf-layout           │    │              │
└────────────────┘    └────────────────────────────────┘    └──────────────┘
```

Same `rf-api` binary, compiled with `--features engine`. S4 task.

### 4.3 Pack endpoint conditional compilation

```rust
// rf-api/src/main.rs
let mut router = Router::new()
    .nest("/api/v2/jobs", jobs::routes())
    .nest("/api/v2/orders", orders::routes())
    .nest("/api/v2/inventory", inventory::routes())
    // ... all non-engine routes ...
    ;

#[cfg(feature = "engine")]
{
    router = router.nest("/api/v2/pack", pack::routes());
}
```

Web CRM deployment compiles without `--features engine`. No runtime decision; route is absent.

**Scope gating — TWO REVIEWER POSITIONS, resolve before S3a Task 1:**

Codex sign-off argues: gate ALL pack-related code behind `#[cfg(feature = "engine")]` — module imports, DTO structs (`PackRequest`, `PackResult`), `rf-application` use-cases, AND `utoipa::path` annotations. The committed `openapi.json` reflects the web build (no `/pack`); desktop emits a separate spec or merges at build time. Keeps the frontend TS client clean and removes accidental scope creep from web users discovering `/pack`.

Gemini sign-off argues the opposite: keep DTOs and `utoipa::path` compiled unconditionally, only feature-flag the `axum::Router::nest` route registration. This keeps ONE unified OpenAPI spec across web + desktop; cloud binary returns 404 for `/pack` instead of having the type absent from the schema. Shared frontend code that references `PackRequest`/`PackResult` types doesn't break.

**Decision needed before S3a Task 1.** Default pick if user doesn't override: Gemini's approach (unified spec + route-only gating) — simpler frontend type story, and the 404-vs-missing-type difference rarely matters in practice for internal tools. Record the decision in a task comment and proceed.

**Package-level check:** `rf-api`'s `Cargo.toml` declares `[features] engine = ["rf-layout"]`. Without the feature, `rf-layout` isn't compiled, ensuring no binary bloat on the cloud deploy.

## 5. Migration phasing

Five sub-phases (S3a through S3e). All use **Next.js wrapper routes** that forward to the Rust backend — no hard frontend cutover, rollback per route is possible.

### S3a — Foundation + cut-history slice (~2 weeks)

Deliver:
- `rf-domain` + `rf-application` + `rf-supabase` + `rf-api` crate scaffolding.
- Axum app with tracing, health, typed error envelope, CORS.
- JWT/JWKS middleware (RS256).
- Request-scoped PostgREST adapter (per-request client, JWT forwarded).
- OpenAPI spec generation via `utoipa-axum` + CI diff check.
- Next.js ↔ Rust client generation via `openapi-typescript`.
- Port `/api/cuts/history`, `/api/cuts/history/[id]`, `/api/cuts/favorites`, `/api/analytics/cut-history`.
- Deploy to Fly.io; Vercel `next.config.mjs` rewrites routes.

Exit criteria:
- Cut-history UI works with zero frontend caller changes.
- No service-role DB access in the cut-history slice — all user-JWT.
- Rust vs TS parity tests pass for role behavior.
- OpenAPI spec committed; TS types regenerated.

### S3b — Read-model migration out of the browser (~2 weeks)

Deliver:
- Port material types, rolls, suppliers, profiles/users reads.
- TS side: stop calling `supabase.from(...)` directly in UI components; route through Rust API.
- At least one complete UI slice (e.g., inventory dashboard) has zero direct browser-to-Supabase data calls.

Exit criteria:
- Browser-only Supabase imports removed from at least one dashboard slice.
- Rust vs TS parity on read endpoints.

### S3c — Procurement aggregate (~3 weeks)

Deliver:
- Rust entities + use-cases for purchase orders and reorder.
- Atomic write strategy for PO create/update/receive and reorder-generated PO creation — Postgres RPCs for true transaction boundaries.
- Fix race-prone `generatePONumber()` as part of the port (Codex flagged).
- Deprecate TS `PurchaseOrderService` + `reorderCalculations`.

Exit criteria:
- Create/update/approve/reject/receive PO flows run through Rust only.
- Reorder suggestion + create-PO flows run through Rust only.
- Concurrency tests prove PO numbering and receipt flows are safe under race.

### S3d — Side effects + background jobs (~2 weeks)

Deliver:
- Notification queue producer/consumer in Rust.
- Email sending in Rust (via existing Supabase Edge Function or direct SMTP).
- Storage adapters (for document uploads).
- Remove client-side queue polling logic.
- Token-bucket rate limiting + content-hash dedup.

Exit criteria:
- Notifications are created server-side with explicit ownership (not derived from `auth.uid()` in triggers).
- No browser-resolved background job logic remains.

### S3e — Final cutover + Tauri prep (~2 weeks)

Deliver:
- Remove remaining direct browser Supabase data access except auth/session.
- Deprecate service-role Next API routes.
- Deprecate `app/api` Next routes that got ported.
- `rf-application` proven transport-agnostic (internal test harness bypasses `rf-api` HTTP layer, calls use-cases directly).
- Document the Tauri-embedding path for S4.

Exit criteria:
- Web CRM uses Rust backend for all domain operations.
- `rf-application` has a Tauri command adapter proof-of-concept (no UI, just "Tauri calls pack directly and gets a response").

**Total S3 scope estimate: 10-12 weeks for one engineer, 7-9 weeks for two with a clean domain split.**

## 6. Risk areas

1. **RLS bypass** (most severe). Rust backend MUST instantiate PostgREST clients per-request with the user's JWT. Never use SERVICE_ROLE key for user-scoped operations. Mitigation: dependency-injection pattern forbids global client; clippy-style lint on `ServiceRoleClient` usage.

2. **`auth.uid()` in DB functions**. Current Postgres triggers/functions infer ownership from `auth.uid()`. That breaks when a Rust worker (not bound to any user session) runs an operation. Mitigation: audit DB functions; rewrite any that assume session context to take explicit user_id parameters.

3. **Schema drift**. Supabase migrations keep happening; Rust structs could lag. Mitigation: `sqlx::query!` macros where schema coupling matters; otherwise `#[serde(default)]` + `#[serde(rename_all = "camelCase")]` discipline for DTOs.

4. **Roles in `profiles`, not JWT claims**. Current role-based access uses `profiles.role` lookup. Rust middleware would need to do a round-trip per request. Mitigation options: (a) accept the round-trip, cache per-JWT; (b) add a Supabase access-token hook that injects role into the JWT.

5. **Non-transactional TS implementations being ported** (Codex sign-off detail). PO receipt + reorder in TS are multi-write without transactions. Existing Supabase `generate_po_number()` function uses `MAX(...) + 1` — STILL race-prone. TS services are worse, doing `count + 1` in application code (`purchaseOrderService.ts:539-550`, `reorderService.ts:385-396`). **S3c must ship new sequence- or advisory-lock-backed RPCs** for create/update/receive. File under `src/infrastructure/supabase/migrations/` alongside existing schema history.

6. **Refresh token race** (mitigated by the "auth stays frontend-owned" decision). If we'd tried to own refresh in Rust, we'd have duplicated Supabase's single-use reuse-detection. We don't.

## 7. Testing strategy

**Codex sign-off correction:** vanilla Postgres via testcontainers-rs can't validate the real S3 request path because our migrations depend on Supabase-specific schema (`auth.users`, `auth.identities`, `auth.uid()`, role/profile helpers). Bare Postgres is only useful for isolated SQL/RPC unit tests.

- **Unit tests** in `rf-domain` (pure Rust, no DB, no containers).
- **`rf-application` use-case tests** with fake port implementations (in-memory `CutHistoryPort` etc.). No container needed.
- **`rf-supabase` adapter tests** run against the **Supabase local development stack** (`supabase start` CLI spins up the full stack: Postgres + Auth + PostgREST + Storage). Seed `auth.users` + `profiles` rows, then exercise the adapters. Adds ~60s startup but validates actual RLS + auth semantics.
- **`rf-api` E2E tests** run against the same Supabase local stack. Exercise full request path: bearer token → middleware → port → PostgREST → response.
- **SQL/RPC unit tests** may use bare Postgres via testcontainers-rs where the feature under test doesn't touch Supabase-specific schema (e.g., pure PL/pgSQL math functions).
- **Parity tests** — for each S3 phase, a Rust vs TS output-equivalence test on the same input ensures no regression.

CI budget: local-Supabase integration tests run on push to `refactor/rf-engine`. Cold-start is ~45-60s; parallelized with other jobs so the wall-clock impact is limited. Unit tests run on every commit.

## 8. Out of scope for S3

- Tauri desktop app integration — that's S4. S3 proves `rf-application` is Tauri-ready via a standalone POC test.
- Interactive editor / vector export — that's S5.
- New business features — S3 is a port, not an expansion.
- Schema redesign — if current Supabase schema has bad decisions, we call them out but don't fix in S3.

## 9. References

- Axum docs: https://docs.rs/axum/
- PostgREST docs: https://postgrest.org/en/v10/api.html
- Supabase JWT/JWKS: https://supabase.com/docs/guides/auth/jwts
- utoipa + utoipa-axum: https://docs.rs/utoipa/
- jsonwebtoken: https://docs.rs/jsonwebtoken/

Research reports:
- `.claude/research/s3-spec/gemini-report.md`
- `.claude/research/s3-spec/codex-report.md`
