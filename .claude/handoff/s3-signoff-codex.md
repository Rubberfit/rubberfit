# S3 spec + plan sign-off — Codex

Spec: `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`.
Plan: `docs/superpowers/plans/2026-04-19-s3-rust-backend.md`.

## Context

Your research at `.claude/research/s3-spec/codex-report.md` caught several blockers in Gemini's initial draft:
- HS256/anon-key JWT was outdated; JWKS/RS256 is correct.
- `utoipa` beats `ts-rs` for real API-contract drift.
- First slice should be cut-history, not TaxService.
- Scope estimate is 10-18 weeks, not 6.
- Most of the app talks to Supabase from the browser, not `app/api`.

User made the architectural decisions on top of your recommendations:

1. **Product split**: desktop = full product + engine; web CRM (Vercel) = lightweight business tracking only. QuickBooks-style.
2. **Deployment**: Vercel for Next.js; Fly.io for Rust backend serving web users. Desktop bundles Rust backend in S4. Pack endpoint via Cargo feature flag.
3. **Auth**: Supabase sessions stay frontend-owned (your recommendation).
4. **Writes**: uniform routing through Rust backend.

The spec + plan now lock in your recommendations + the user's decisions.

## Your task

Return a strict sign-off at `.claude/research/s3-spec/codex-signoff.md`, ~900 words max. Be as strict as you were on S2.5 Task 9.5 / Task 12 — those catches saved us days of debugging.

Questions:

1. **Crate split correctness.** `rema-domain` / `rema-application` / `rema-supabase` / `rema-api`. Is this the right factoring?
   - Does `rema-application` actually stay transport-agnostic if we're also shipping an HTTP server (`rema-api`)? What prevents leaky abstractions (e.g., `tower::Service`-shaped interfaces creeping into `rema-application`)?
   - Should `rema-application` depend on `rema-supabase` via trait objects, or compile-time generics? Which is more Tauri-friendly for S4?

2. **Feature-flag `engine` module.** Spec §4.3 says web deployment compiles without `--features engine`. Does this break the OpenAPI spec (routes missing at build time vs runtime)? Does `utoipa-axum`'s route registration play nice with `#[cfg(feature = "engine")]` inside `main.rs`?

3. **Write routing through Next.js wrappers.** User chose option (a) — all writes go Browser → Next → Rust → Supabase. Does that introduce any correctness issues around request idempotency or retry semantics? (Next.js rewrites are transparent proxies; do they preserve POST body + headers faithfully, especially streaming response bodies like the NDJSON pack progress?)

4. **S3a task decomposition.** Tasks 1-11 look roughly right, but:
   - Task 7 (OpenAPI + TS gen) before Task 10 (frontend cutover) — can Task 10 actually consume the generated types during the first iteration, or does that require a chicken-and-egg cycle (ship the server, generate the types, then wire the frontend)?
   - Task 9 (Fly.io deployment) before Task 10 (frontend cutover). Is there a dry-run / staging step needed before pointing production Vercel at a Fly instance?
   - Task 5 (`rema-application` ports) — do we actually need a ports/hexagonal abstraction for S3a's minimal slice, or is that premature?

5. **Testcontainers-rs ergonomics.** Spec §7 says we'll use testcontainers-rs for integration tests — Postgres with migrations applied. In practice, how painful is this given that Supabase-specific schema (`auth.users`, `storage.buckets`, RLS on nearly every table) isn't available in vanilla Postgres? Do we need to either (a) mock the Supabase-specific tables, (b) run the full Supabase Docker stack, (c) skip some tests?

6. **Postgres RPCs for atomic PO flows (S3c).** Your report flagged race-prone `generatePONumber`. Do we need to write new Postgres functions, or do existing Supabase migrations already have them? If we're adding functions, do they live in `supabase/migrations/` alongside TS-era migrations?

7. **Rollback via feature flags.** Plan §cross-phase-concerns says each sub-phase is behind a TS-side feature flag (`USE_RUST_<DOMAIN>=true`). Is that the right mechanism, or should it be Next.js middleware that routes per-request based on header/cookie? The latter would enable canary deploys.

8. **`pack-cli` fate.** Plan §5 S3e keeps pack-cli through S3, deprecates it post-S4. But spec §4.1 shows web CRM with no pack endpoint. Does pack-cli stay as the desktop pack interface until S4 Tauri embeds it directly? Does that mean S3 ships TWO pack paths (pack-cli subprocess for current users + absent /pack on web)?

9. **Sharp edges specific to the plan docs.** Anything in the spec or plan that reads accurate but will break under S3a implementation pressure? Same level of scrutiny as your Task 12 / Task 19 callouts.

10. **Verdict**: approve-as-written / approve-with-changes / needs-revision.

Files:
- `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`
- `docs/superpowers/plans/2026-04-19-s3-rust-backend.md`
- `.claude/research/s3-spec/codex-report.md` (your prior report for cross-reference)

Be strict. The first S3 task starts immediately after your sign-off lands.
