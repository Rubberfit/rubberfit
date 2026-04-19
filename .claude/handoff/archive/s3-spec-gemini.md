# S3 spec research — Rust backend service + Supabase port (Gemini)

## Context

REMA Portal (rema-portal) just tagged `s2.5c-production-ready` — the Rust nesting engine (FFD + 2D grid warm-start + sparrow GLS + cross-bin swap + NDJSON progress streaming) is production-ready, strictly dominates the legacy TS engine on parity fixtures, and exposes a clean stdin/stdout interface via `pack-cli`.

Branch `refactor/rf-engine` is 110 commits ahead of `main`.

**Per the migration overview doc** (`docs/superpowers/specs/2026-04-17-migration-overview-design.md` §3):

> **S3** — Rust backend service + Supabase — Port service/use-case layer; introduce entity layer; define the frontend-facing API
>
> S3 and S4 can run in parallel once S2.5 is stable.

S2.5 is now stable. Time to scope S3.

## Your assignment

Write `.claude/research/s3-spec/gemini-report.md`. Scope a Rust backend service that replaces the current Next.js + TypeScript service/use-case layer with a native Rust HTTP server, keeping Supabase (PostgreSQL + auth) as the persistence layer.

Current TS layer (to be replaced):
- `src/application/services/` — service interfaces (notification, purchase-order, tax, packing, reorder, cut, csv, email, roll, part, etc.)
- `src/application/use-cases/` — use-case classes (create-po, reorder calculations, etc.)
- `src/infrastructure/services/` — Supabase-backed implementations (~20 files)
- `src/infrastructure/repositories/` — Supabase repository impls
- `src/entities/` — reserved directory, currently empty
- `app/api/` — Next.js API routes (handful of them)

Public surface the Rust backend must provide:
- HTTP/JSON API callable from the Next.js frontend.
- Same auth model (Supabase JWT).
- Same row-level security (RLS) respect — Rust server acts as Supabase client, NOT a service-role bypass.
- Progressive migration — we don't flip everything at once; run TS + Rust in parallel during cutover.

## Research questions

1. **HTTP framework choice.** Axum vs Actix vs Rocket vs raw Hyper. Pick one and justify based on (a) async ergonomics, (b) tower middleware compatibility, (c) Supabase/Postgres integration, (d) TypeScript client gen story (tsync, ts-rs, utoipa+openapi).

2. **Supabase integration.** Options: (a) use `supabase-rs` (community crate, MPL-2.0), (b) use `sqlx` against the Postgres URL directly + JWT verification separately, (c) REST-call Supabase's PostgREST endpoint. Recommend one with trade-offs on RLS enforcement + migrations + type gen.

3. **Entity layer.** The TS side has no entity layer (`src/entities/` is empty). What does a Rust entity layer look like — DDD-style rich objects, or simple structs with methods? Recommend based on REMA's domain complexity.

4. **Type safety across the wire.** TypeScript frontend consumes JSON from Rust backend. Options: (a) hand-write TS types + Rust types, (b) `ts-rs` generates TS from Rust, (c) OpenAPI/utoipa generates both, (d) tRPC-like shared-type abstraction. Recommend for our stack.

5. **Migration strategy.** How do we run Next.js + Rust backend in parallel during cutover? Reverse-proxy (Nginx) routing by path? Feature flags per endpoint? Hard cutover per service? Recommend a phasing that minimizes risk.

6. **Auth.** Supabase issues JWTs. Rust backend needs to (a) verify JWT, (b) respect RLS when querying Postgres as the authenticated user. Sketch the auth middleware.

7. **Service → endpoint mapping.** Looking at the 20+ TS services, propose an endpoint decomposition for Rust. One crate, one binary? One crate per service domain? Or a monolithic `rema-api` crate with module-per-domain structure?

8. **Deployment.** Next.js currently runs via `npm start`. Rust backend — standalone binary, Docker container, shuttle.rs, Vercel+Rust? Recommend based on REMA's desktop-app trajectory (S4 Tauri).

9. **Testing strategy.** Current TS has Vitest + service/repository fakes via TSyringe. Rust side — how do we test services with Supabase dependency? testcontainers-rs? supabase-rs mocks? Integration tests against a real test-tenant Supabase instance?

10. **Risk/scope estimate.** How many phases would S3 realistically split into? S3a/b/c/d? What's the minimum viable Rust backend that still ships something useful (e.g., "just the packing endpoint" vs "full service port")?

## Deliverable

`.claude/research/s3-spec/gemini-report.md`, aim 2000-3000 words.

Structure:
1. Recommended stack (framework + Supabase integration + type gen)
2. Entity layer design
3. Migration phasing (S3a/b/c etc with concrete exit criteria)
4. Risk areas (auth, RLS, schema drift, performance regressions)
5. Minimum viable first cut (what S3a ships)
6. Proposed timeline / scope estimate
7. Open questions that need user input before implementation

## Files to read first

- `docs/superpowers/specs/2026-04-17-migration-overview-design.md` — the parent roadmap.
- `docs/superpowers/specs/2026-04-18-s2.5-rust-engine-design.md` — template for how we scope Rust work.
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` — template for how we structure phase plans.
- `src/application/` — the services + use-cases we're porting.
- `src/infrastructure/services/` — Supabase-backed TS implementations.
- `src/infrastructure/repositories/` — Supabase repos.
- `CLAUDE.md` — the overall architecture + clean-architecture boundary rules.
- `engine/Cargo.toml` — current Rust workspace structure (new crates slot in here).

Do not modify any code. Output only the report.
