# S3 spec research — Rust backend service + Supabase port (Codex)

## Context

REMA Portal just tagged `s2.5c-production-ready`. The Rust nesting engine ships via `pack-cli` stdin/stdout. Next up in the migration roadmap: **S3 — port the TypeScript service/use-case/repository layers to a Rust HTTP backend**, keeping Supabase (Postgres + auth) as the persistence tier.

This is the biggest architectural move since the original Rust engine (S2). Multi-month scope. Gemini is writing a parallel design report at `.claude/research/s3-spec/gemini-report.md`. You write `.claude/research/s3-spec/codex-report.md` — implementation-focused second opinion that stress-tests Gemini's proposals and flags the correctness/migration traps.

## Current TS stack (to be ported)

- `src/application/services/` — service interfaces (~15 files: notification, purchase-order, tax, packing, reorder, cut, csv, email, roll, part, etc.)
- `src/application/use-cases/` — use-case classes (~7 files under purchase-orders/ + reorder/)
- `src/infrastructure/services/` — Supabase-backed impls (~20 files)
- `src/infrastructure/repositories/` — Supabase repo impls
- `src/entities/` — reserved, currently empty
- `app/api/` — Next.js API routes (small number)
- `supabase/migrations/` — SQL migrations, RLS policies, triggers

## Your key implementation questions

1. **HTTP framework — Axum vs Actix vs alternatives.** Both have 10k+ stars. Axum: tower-based, shares primitives with hyper/tonic, better async ergonomics. Actix: older, actor model, faster in some benchmarks. Strengths/weaknesses in 2026 (after async trait stabilization)? Which has better Supabase/Postgres story + OpenAPI gen?

2. **Supabase client strategy — sqlx vs supabase-rs vs PostgREST.**
   - `sqlx` against the Postgres URL bypasses RLS unless we set JWT claims per-session. Tricky.
   - `supabase-rs` (community) wraps PostgREST, respects RLS naturally, but MPL-2.0 and lags Supabase JS client.
   - Direct PostgREST calls from Rust give us the SAME RLS semantics the TS frontend has, at the cost of an extra network hop.
   Recommend one with concrete trade-off analysis. How does the recommendation interact with Supabase Edge Functions (we have some)?

3. **JWT verification + RLS.** The TS stack has Supabase doing JWT verification automatically via the JS client. In Rust, we need:
   - Verify the incoming Authorization: Bearer <JWT> with Supabase's JWKS.
   - Pass the user's JWT through to PostgREST/Postgres so RLS evaluates against the real user.
   - Handle expired JWTs, refresh tokens, etc.
   What's the right Rust crate for this (`jsonwebtoken`, `josekit`) and what are the sharp edges (e.g., clock skew, key rotation, revocation)?

4. **Type safety TS ↔ Rust.**
   - `ts-rs`: generates `.ts` files from `#[derive(TS)]` Rust structs. Lives in rust-lang ecosystem.
   - `utoipa`: OpenAPI schema generation from Rust type annotations; openapi-typescript converts to TS.
   - Hand-written types on both sides with a shared JSON schema.
   - tRPC-like (no real Rust equivalent yet; `trsync` is experimental).
   Recommend one. What breaks when the Rust side changes a field shape?

5. **Migration strategy — parallel run + cutover.** We can't flip everything at once. Options:
   - **Reverse proxy**: Nginx routes some paths to Rust (port 8080), others to Next.js (port 3000). Per-endpoint migration.
   - **Next.js API route thin wrappers**: Rust runs standalone; Next.js API routes do `fetch('http://localhost:8080/...')`. Keeps frontend unchanged.
   - **Hard cutover per service**: Move all endpoints for one service (e.g., packing) at once, delete the TS impl, update frontend callers.
   Recommend a safe phasing. What's the blast radius if a Rust endpoint ships a bug?

6. **Entity layer from scratch.** TS side has NO entity layer (`src/entities/` is empty). In Rust we'd add one. What does a REMA entity look like? For example:
   - `Roll` — inventory item with dimensions, status, depletion logic.
   - `Cut` — operation with shapes, assignment, efficiency.
   - `PurchaseOrder` — with line items, tax, status transitions.
   How much domain logic moves from service methods INTO entities? What's the right split?

7. **Migrations + schema management.** `supabase/migrations/*.sql` already exists. Rust backend needs to know the schema. Options:
   - `sqlx::query!` macros generate compile-time types from live DB.
   - `prisma-client-rust` generates types from a Prisma schema.
   - `sea-orm` generates from DB introspection.
   - Hand-written Rust types mirroring the SQL DDL.
   Which keeps schema + Rust types in sync best? What breaks during a migration?

8. **Testing strategy.**
   - Unit tests: pure Rust, no DB. Easy.
   - Integration tests: testcontainers-rs spins up a Postgres with the migrations applied, tests run against it.
   - E2E tests: spin up the real Supabase local dev stack, run both the Rust backend and Next.js frontend. Heavy but real.
   Recommend the mix. How do we run these in CI without hitting Supabase API limits?

9. **Deployment + packaging.** Current Next.js ships via `npm start` (or Vercel). Rust backend:
   - Docker container.
   - Shuttle.rs (managed Rust deploy).
   - Just a binary on a VPS.
   - Supabase Edge Functions (Deno only — not Rust today).
   S4 ships a Tauri desktop app. Does the Rust backend get embedded INTO the Tauri app (no network hop), or stays as a separate service? This matters for deployment scope.

10. **Scope split — how many sub-phases.** S2.5 was 20 tasks across 3 sub-phases. S3 will be bigger. Propose S3a/b/c/etc with concrete deliverables per sub-phase. What's the MINIMUM VIABLE first sub-phase that ships something useful (e.g., "Rust backend serves JUST the packing endpoint"; or "Rust backend handles JUST auth"; or "port ONE service fully")?

## Deliverable

`.claude/research/s3-spec/codex-report.md`, aim 2000-3000 words.

Implementation-focused structure:

1. Executive summary (50 words): chosen stack + phase split
2. Framework choice (Axum recommended or not, with evidence)
3. Supabase integration (sqlx vs PostgREST vs supabase-rs)
4. JWT + RLS propagation mechanics (code sketch)
5. Type-safety wire strategy
6. Migration phasing with exit criteria
7. Tauri embedding implications (S3 ↔ S4 interaction)
8. Sharp edges / gotchas (8+)
9. Scope estimate — sub-phase count + minimum viable first cut
10. Open questions for the user
11. Verdict: ready-to-build-spec / needs-more-research / needs-user-input

## Files to read first

- `docs/superpowers/specs/2026-04-17-migration-overview-design.md` — parent roadmap.
- `docs/superpowers/specs/2026-04-18-s2.5-rust-engine-design.md` — template for Rust-work spec.
- `src/application/` — everything we're porting.
- `src/infrastructure/services/supabase/` + `src/infrastructure/repositories/` — what Supabase integration looks like today.
- `supabase/migrations/` — SQL schema + RLS policies.
- `CLAUDE.md` — architecture boundary rules.
- `app/api/` — existing Next.js API surface.
- `engine/Cargo.toml` — Rust workspace (new crates slot in).

Be strict. This is the scoping research that decides whether S3 is a 6-week project or a 6-month project.
