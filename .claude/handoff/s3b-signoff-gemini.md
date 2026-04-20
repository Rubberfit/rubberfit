# S3b plan sign-off — Gemini

## Context

S3a just tagged (`s3a-foundation`) — cut-history served from Rust
through a Next.js cookie→bearer bridge, verified on Fly staging.
Pattern: `rf-domain` types → `rf-application` Port trait + use
cases → `rf-supabase` PostgREST adapter → `rf-api` Axum handlers +
utoipa OpenAPI → generated `types.ts` → Next.js route handlers in
`app/api/v2/**` → UI behind `NEXT_PUBLIC_USE_RUST_CUT_HISTORY`.

S3b scales this to **inventory**: rolls, material_types, suppliers,
material_suppliers. Full read + write CRUD. User chose the full
scope over narrower options: "cleanliness is way more important."

## What to review

The draft plan at:

`docs/superpowers/plans/2026-04-19-s3b-inventory.md`

Cross-reference against the existing codebase:

- `src/infrastructure/repositories/rolls.repository.ts` — 243 LOC of
  methods I'm porting. Did I miss any operation the plan doesn't
  cover?
- `src/infrastructure/repositories/material-types.repository.ts` — 78 LOC.
- `src/infrastructure/services/supplierService.ts` — 443 LOC.
  Largest service — suppliers + material_suppliers + preferred
  supplier logic all live here.
- `src/infrastructure/supabase/migrations/20240217*_create_rolls_table.sql`
  and siblings — schema source of truth.
- `app/dashboard/inventory/page.tsx`,
  `app/dashboard/materials/types/page.tsx`,
  `app/dashboard/materials/suppliers/**` — UI callers.
- `engine/crates/rf-*` — the S3a pattern to mimic.

## What I need from you

Architectural checks the `codex-signoff.md` brief may miss:

1. **Domain modeling.** Plan proposes `Roll`, `MaterialType`,
   `Supplier`, `MaterialSupplier` as separate aggregates in
   `rf-domain`. Is `MaterialSupplier` properly its own aggregate
   (value object in an aggregate root? part of the `Supplier`
   aggregate?) or am I fragmenting an invariant? Does the port
   trait design make sense given the referential integrity between
   these tables?

2. **Denormalized `rolls.material_type` field.** Stored alongside
   the FK. Plan says "server stamps the name on create/update from
   `material_type_id` lookup to prevent drift." Is this the right
   call, or should the Rust domain drop the denorm and always
   look it up on read? (Read side would be a PostgREST embed.)
   Trade-offs: write hot path vs read hot path vs denorm drift.

3. **Invariants and race conditions.** Two I've called out in the
   plan:
   - `setPreferredSupplier` isn't transactional (PostgREST can't).
   - Depletion trigger fires asynchronously with Rust write.
   Any others? (E.g. FK constraints the UI violates today but
   tests don't catch.)

4. **OpenAPI schema changes.** Adding 16+ routes grows the spec
   significantly. Is `ApiDoc` in `rf-api/src/openapi.rs` going to
   become unmaintainable? Should I split it per-resource
   (`CutsDoc`, `InventoryDoc`, merged at the top level) now, or is
   that premature abstraction?

5. **Parity test coverage.** Plan Task 9 stubs fetch and checks
   shape equivalence. Is that enough, or do we need a live
   end-to-end test that hits both backends against a test Supabase
   project? S3a got by with stubs + staging smoke; S3b has 5× the
   surface area.

6. **UI cutover risk.** The materials/suppliers subtree uses a
   Zustand store (`app/stores/supplierStore.ts`) that wraps
   `supplierService` tightly. Plan says "swap what the store calls,
   not how it's structured." Does the store's shape actually
   tolerate a backend swap cleanly, or is there hidden coupling
   (e.g. Supabase-specific error shapes, subscription logic) that
   breaks?

7. **Sequencing.** Plan does MaterialType → Supplier →
   MaterialSupplier → Roll. Junction table before or after its
   two sides are done? I have MaterialSupplier as Task 4, but
   maybe it should be last (Task 5 or later), after Rolls, since
   it depends on having both MaterialType and Supplier working
   AND is the most nuanced to test (unique constraints, embed
   queries).

## Expected output

Write your review to `.claude/research/s3b-plan/gemini-signoff.md`.

```markdown
# S3b plan review — Gemini

## Verdict: [sign-off | conditional sign-off | block]

## Required changes (if any)
- ...

## Nice-to-haves / follow-ups
- ...

## Things I looked at that are fine
- (brief — just note what you verified so we know it's covered)

## Questions for Claude
- ...
```

Don't spare blunt feedback — the point of dual sign-off is to
catch what one reviewer misses. If something feels off but you
can't articulate why, say so; I'll dig in.
