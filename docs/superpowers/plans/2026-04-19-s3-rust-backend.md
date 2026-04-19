# S3 — Rust Backend Service Execution Plan

**Spec:** `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`.
**Parent:** `docs/superpowers/specs/2026-04-17-migration-overview-design.md`.
**Branch:** `refactor/rf-engine` (same as S1/S2/S2.5 — all refactor work continues in one branch; PR opens at the end).
**Base commit:** `b618ed6` (S2.5 Task 20 — `s2.5c-production-ready`).
**Estimated scope:** 10-12 weeks single-engineer, 7-9 weeks two-engineer.

---

## Phase roadmap

| Phase | Scope | Exit criteria | Est. |
|---|---|---|---|
| **S3a** | Foundation + cut-history slice | Rust API serves cut-history behind Next.js wrappers; JWT/JWKS middleware proven; OpenAPI spec + TS types | ~2 weeks |
| **S3b** | Read-model migration out of browser | One full dashboard slice has zero browser-to-Supabase data calls | ~2 weeks |
| **S3c** | Procurement aggregate (POs + reorder) | All PO + reorder writes run through Rust, transaction-safe | ~3 weeks |
| **S3d** | Side effects + background jobs | Notifications + email server-side, no browser-resolved jobs | ~2 weeks |
| **S3e** | Final cutover + Tauri prep | Web CRM 100% through Rust backend; `rema-application` has Tauri command POC | ~2 weeks |

Each phase ships a git tag on completion: `s3a-foundation`, `s3b-read-model`, `s3c-procurement`, `s3d-side-effects`, `s3e-complete`.

Every task follows the established cadence from S2.5:
1. Gemini + Codex parallel research → spec draft → dual sign-off.
2. TDD implementation.
3. 5-gate quality pass: cargo test + clippy + release build + CodeRabbit + code-reviewer agent review.
4. CodeRabbit CLI before commit.
5. Gemini + Codex implementation review (drift check vs plan).
6. Commit on green.

---

## S3a — Foundation + cut-history slice

**Goal:** prove the end-to-end Rust → Supabase → frontend loop on a contained slice. After S3a lands, we know: (1) the crate split works, (2) JWKS verification is correct, (3) RLS propagation is correct, (4) OpenAPI type-gen is usable, (5) Fly.io deployment works.

### S3a Task 1: Crate scaffolding

Create the four new crates in `engine/Cargo.toml`:
- `rema-domain` — pure Rust, no deps beyond `serde` + `thiserror`.
- `rema-application` — depends on `rema-domain` + defines `Ports` traits (what Supabase looks like from the app's view).
- `rema-supabase` — depends on `rema-domain` + `rema-application` + `reqwest`; implements the `Ports` traits.
- `rema-api` — depends on all three + `axum` + `utoipa` + `jsonwebtoken`.

Starter content: crate-level `lib.rs` with rustdoc header explaining purpose, and a `README.md` per crate (per user preference: every new directory gets a README in the same commit).

No business logic yet. Just the skeleton.

**Tests:** `cargo check --workspace` green. Empty crates compile.

**Commit:** `feat(workspace): scaffold rema-domain/application/supabase/api crates (S3a Task 1)`

### S3a Task 2: Axum server boot + health endpoint

In `rema-api`:
- `main.rs` — boots Axum on `127.0.0.1:8080` (configurable via `REMA_API_BIND`).
- `/health` endpoint returns `{ "status": "ok", "version": env!("CARGO_PKG_VERSION") }`.
- `tracing_subscriber` wired with env filter.
- `tower::timeout` middleware (30s default).
- `tower_http::cors::CorsLayer` — permissive in dev, configurable origin in prod.
- `tower_http::request_id::SetRequestIdLayer` — UUID per request.

**Tests:** integration test hits `/health`, asserts 200 + JSON body.

**Commit:** `feat(rema-api): axum server boot + health endpoint (S3a Task 2)`

### S3a Task 3: JWKS + JWT middleware

- Fetch JWKS from `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` on startup; cache with TTL 10min; refresh on cache miss.
- Middleware extracts `Authorization: Bearer <jwt>`, verifies via `jsonwebtoken`:
  - alg = RS256
  - iss = `<SUPABASE_URL>/auth/v1`
  - 30s clock leeway
- Attach `AuthContext { raw_jwt, claims }` to request extensions.
- 401 on missing / invalid / expired tokens.
- Dispatch helpers: `require_auth(req)` → `&AuthContext`.

**Tests:** middleware integration test with (a) valid JWT (mocked JWKS), (b) expired JWT → 401, (c) wrong issuer → 401, (d) missing header → 401.

**Commit:** `feat(rema-api): JWKS + RS256 JWT verification middleware (S3a Task 3)`

### S3a Task 4: Request-scoped PostgREST adapter

In `rema-supabase`:
- `PostgrestClient` constructor takes `(base_url, publishable_key, user_jwt)` and builds a fresh `reqwest::Client` with headers pre-set.
- **Explicitly disallow global/service-role clients.** Document the security invariant.
- Helper `fn user_postgrest(state: &AppState, auth: &AuthContext) -> PostgrestClient`.

**Tests:** unit tests verify header assembly (apikey + Authorization) from auth context.

**Commit:** `feat(rema-supabase): request-scoped PostgREST client (S3a Task 4)`

### S3a Task 5: `rema-application` ports for cut-history

In `rema-application`:
- Trait `CutHistoryPort` with methods mirroring the TS `cutService` interface — `list_history(user_id, filters)`, `get_history_item(user_id, id)`, `list_favorites(user_id)`, etc.
- Use-case orchestrators `ListCutHistoryUseCase`, `GetCutHistoryItemUseCase`, `ListFavoritesUseCase`.
- Each use-case is `#[async_trait]`-able, takes the port trait as an `Arc<dyn CutHistoryPort + Send + Sync>` (Codex sign-off: dyn over generics at I/O boundaries — simpler state wiring, same performance).

**Scope (Codex-locked):** keep the port minimal for S3a. One or two capability-specific traits, NOT a generalized hexagonal framework. Expand as needed in later phases.

`rema-supabase` implements `CutHistoryPort` via PostgREST calls to the `cut_history` + `cut_history_favorites` tables. (Codex sign-off: table is `cut_history_favorites`, not `cut_favorites` — match `src/infrastructure/supabase/migrations/20260412120000_create_cut_history_favorites.sql`.)

**Tests:** unit tests on use-cases with a fake port implementation.

**Commit:** `feat(rema-application,rema-supabase): cut-history ports + use-cases (S3a Task 5)`

### S3a Task 6: Cut-history HTTP routes

In `rema-api`:
- `GET /api/v2/cuts/history` — pagination params, filter query.
- `GET /api/v2/cuts/history/:id`
- `GET /api/v2/cuts/favorites`
- `GET /api/v2/analytics/cut-history` — aggregation endpoint.

Each route:
- Extracts `AuthContext`.
- Builds per-request PostgREST client with user JWT.
- Delegates to the corresponding use-case.
- Returns DTOs annotated with `utoipa::ToSchema`.

**Tests:** integration tests with testcontainers-rs (Postgres + Supabase schema applied) — spin up the real DB, seed test data, hit the routes, assert responses.

**Commit:** `feat(rema-api): cut-history HTTP routes + DTOs (S3a Task 6)`

### S3a Task 7: OpenAPI spec + TS type generation

- `utoipa::OpenApi` derive on a root struct collecting all S3a routes + DTOs.
- Spec served at `/openapi.json`.
- Build step: `cargo run --bin dump-openapi > openapi.json` committed to repo.
- Next.js build hook: `openapi-typescript openapi.json --output src/infrastructure/api-client/types.ts`.
- Frontend API client starts consuming generated types.

**Tests:** CI check — regen spec, diff against committed, fail if drift.

**Commit:** `feat(rema-api): openapi spec + TS type generation pipeline (S3a Task 7)`

### S3a Task 8: Next.js route handlers (cookie → bearer bridge)

**Codex sign-off critical correction:** pure `next.config.mjs` rewrites WILL NOT WORK. Current frontend callers (e.g. `app/dashboard/history/_components/use-cut-history.ts`, `app/dashboard/cut-planner/page.tsx`) authenticate via Supabase session cookies — they do NOT send `Authorization: Bearer ...`. A rewrite is a transparent proxy; it cannot mint a bearer token from a cookie. Pure rewrites therefore can't feed the Rust JWKS middleware.

**Required implementation:** real Next.js route handlers under `app/api/v2/cuts/**/route.ts` that:

```typescript
// app/api/v2/cuts/history/route.ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET(req: Request) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { /* ssr adapter wiring */ } }
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const upstream = await fetch(
    `${process.env.REMA_API_URL}/api/v2/cuts/history${new URL(req.url).search}`,
    {
      headers: {
        "Authorization": `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      method: req.method,
      // body for POST/PUT, streamed
    }
  )
  // Stream response body back with preserved status + headers
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}
```

Key properties:
- Reads Supabase session server-side (the cookie-based auth the rest of the app uses).
- Extracts access token, forwards as `Authorization: Bearer <jwt>` to Rust.
- Streams response body (preserves SSE / NDJSON for future Task 15-style streaming).
- 401 on no session → triggers client-side Supabase refresh flow.

**Why route handlers instead of rewrites:** cookie → bearer bridge is mandatory. Route handlers also give us:
- Per-route feature flags (`USE_RUST_<DOMAIN>` for canary/rollback).
- Idempotency key injection for non-idempotent writes (S3c scope).
- Request ID propagation for end-to-end tracing.

**Tests:** integration — browser with Supabase cookie hits `/api/v2/cuts/history`, Rust receives a valid bearer, returns data.

**Commit:** `feat(web): next.js route handlers bridge cookie→bearer to rust backend (S3a Task 8)`

### S3a Task 9: Fly.io deployment

- `Dockerfile` in `engine/crates/rema-api/` — multistage build, `FROM scratch` final image.
- `fly.toml` — single region (e.g., `sjc` or user's pick), autoscaling 0-1, health check on `/health`.
- Secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` (for migrations), etc.
- `fly deploy` documented in `engine/crates/rema-api/README.md`.

**Tests:** smoke test against deployed instance — auth + cut-history roundtrip.

**Commit:** `chore(rema-api): fly.io deployment config + docs (S3a Task 9)`

### S3a Task 9.5: Fly staging + Vercel preview smoke (Codex sign-off)

Before pointing production Vercel at a Fly instance, validate end-to-end on a staging pair:

- Deploy `rema-api` to `rema-api-staging.fly.dev` with staging Supabase credentials.
- Create a Vercel preview deployment pointing `REMA_API_URL` at the staging Fly host.
- Run an authenticated smoke test: log in as a test user → hit cut-history → verify response matches staging Supabase data.
- Load-test with ~100 concurrent requests to check cold-start behavior on Fly autoscale-to-zero.
- Document the outcome in the S3a retro notes.

Only after green: proceed to Task 10 production cutover.

**Tests:** manual smoke script documented at `engine/crates/rema-api/README.md`.

**Commit:** `chore(rema-api): fly staging + vercel preview validation (S3a Task 9.5)`

### S3a Task 10: Frontend cutover + parity validation

**Reality check (Codex sign-off):** this task DOES change frontend callers — callers now hit `/api/v2/cuts/*` instead of direct Supabase. The earlier language "zero frontend caller changes" was wrong; an accurate description is "zero UI-component changes, callers redirected via TS service layer."

- Update `src/infrastructure/services/cutService.ts` to call `/api/v2/cuts/history` etc. instead of direct Supabase.
- Keep the old direct-Supabase code paths behind a feature flag `USE_RUST_CUT_HISTORY=true`. When false, fall back to original implementation. Flag allows per-request rollback.
- UI components (`app/dashboard/history/_components/use-cut-history.ts` etc.) continue calling the service — no component-level change.
- Run parity tests: TS-direct call vs Rust-routed call on same input → same output (field-level comparison, efficiency tolerance).

**Out of scope for S3a:** `/api/users` / role-lookup dependencies. If cut-history's manager/admin views need user-role joins that aren't ported yet, leave those gated until S3b (read-model migration) picks them up. Document the carve-out explicitly.

**Tests:** TS + Rust parity test on cut-history responses. Visual QA on the dashboard.

**Commit:** `feat(web,cuts): wire cut-history UI to rust backend via feature flag (S3a Task 10)`

### S3a Task 11: Tag + retro (was Task 11, now Task 12 post-9.5 insertion)

- `git tag s3a-foundation` on HEAD.
- Update `docs/superpowers/plans/2026-04-19-s3-rust-backend.md` with lessons learned.
- Archive `.claude/research/s3a*` + `.claude/handoff/s3a*` into `archive/` subdirs.

**Commit:** `docs(s3): tag s3a-foundation + retro notes`

### S3a summary

~12 tasks (added 9.5 staging step), ~2 weeks. Exit criteria:
- Cut-history served from Rust backend in production (Vercel → Fly.io).
- JWT + JWKS + RLS propagation proven.
- OpenAPI pipeline in place.
- Frontend consuming generated TS types.
- Parity tests green.
- Next.js route handlers bridge cookie→bearer correctly.
- Fly staging + Vercel preview validated before production cutover.
- Feature flag `USE_RUST_CUT_HISTORY` enables per-request rollback.

---

## S3b — Read-model migration out of the browser (outline)

**Detailed plan doc written at start of S3b.** Top-level scope:

- Port material types, rolls, suppliers, profiles/users reads to Rust.
- Build a TS Rust-API client SDK (thin wrapper over `fetch` + OpenAPI types).
- Migrate at least one complete UI dashboard slice (inventory most likely) away from direct `supabase.from(...)` browser calls.
- Real-time subscriptions stay in browser (Supabase Realtime) since they're read-only.

Exit criteria per spec §5 S3b.

Est. 5-7 tasks, ~2 weeks.

---

## S3c — Procurement aggregate (outline)

**Detailed plan doc written at start of S3c.** Top-level scope:

- Rust entities: `PurchaseOrder`, `PurchaseOrderLine`, `ReorderSuggestion`.
- Postgres RPC functions for atomic PO create / update / receive + reorder-to-PO flows.
- Fix race-prone `generatePONumber` via Postgres sequence or RPC.
- Port `reorderCalculations.ts` math to Rust (float precision parity tested).
- Deprecate TS `PurchaseOrderService` + `reorderCalculations.ts`.

Est. 8-10 tasks, ~3 weeks. Heaviest phase — lots of business logic.

---

## S3d — Side effects + background jobs (outline)

**Detailed plan doc written at start of S3d.** Top-level scope:

- Notification queue producer (Rust) + consumer (Rust, separate binary or background task in `rema-api`).
- Token-bucket rate limiter (`governor` crate or custom).
- Content-hash dedup window.
- Email sending — retained Supabase Edge Function via `reqwest`, OR direct SMTP via `lettre`.
- Storage adapter for document uploads.
- Remove client-side queue polling — browser no longer polls, UI gets updates via Supabase Realtime or SSE from Rust.

Est. 5-7 tasks, ~2 weeks.

---

## S3e — Final cutover + Tauri prep (outline)

**Detailed plan doc written at start of S3e.** Top-level scope:

- Audit: every remaining `supabase.from(...)` call in `src/`/`app/` — port to Rust API OR justify keeping (reads-only).
- Delete ported TS services (`cutService.ts`, `purchaseOrderService.ts`, etc.).
- Delete ported TS `src/application/use-cases/*` — Rust owns them now.
- Build `rema-tauri-adapter` proof-of-concept: a standalone Tauri command (no UI) that calls `rema-application::ListCutHistoryUseCase` directly (bypassing HTTP).
- Document the S4 handoff.

Est. 5-7 tasks, ~2 weeks.

---

## Cross-phase concerns

### RLS safety testing

Every phase that adds write endpoints ships with a test that verifies:
- Authenticated user A cannot see user B's data.
- Anonymous request returns 401.
- Service role is NEVER used for user-scoped operations.

Tests run via testcontainers-rs against a real Postgres with the production RLS policies applied.

### OpenAPI drift CI check

Every PR runs `cargo run --bin dump-openapi > tmp.json` + `diff tmp.json openapi.json`. Non-zero exit = PR fails until spec is regenerated + committed.

### Rollback strategy

Each S3 sub-phase is behind a feature flag (`USE_RUST_<DOMAIN>=true`). If Rust endpoint misbehaves in production, flip flag to fall back to TS. Flags removed when sub-phase is validated + legacy TS code deleted.

**Canary routing (Codex sign-off):** the feature flag implementation lives in the Next.js route handlers (S3a Task 8), not in `next.config.mjs` rewrites. That means we can do per-request routing based on header/cookie — e.g., route 10% of requests to Rust and 90% to TS during initial cutover. `next.config` rewrites are global and can't gate by cookie/header, so they don't serve as a canary mechanism.

### Architecture migration check-in

At the end of S3c (mid-S3), reassess:
- Is the 4-crate split still correct? Or has a better structure emerged?
- Is PostgREST's atomicity story still adequate?
- Are we tracking to 10-12 week estimate?

Adjust remaining phase scopes if needed. Document decisions in `docs/superpowers/plans/2026-04-19-s3-rust-backend.md` changelog section.

---

## References

- Design spec: `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`.
- Research: `.claude/research/s3-spec/{gemini,codex}-report.md`.
- Parent roadmap: `docs/superpowers/specs/2026-04-17-migration-overview-design.md`.
- S2.5 execution reference: `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md`.
