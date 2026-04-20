# S3b plan sign-off — Codex

## Context

S3a just tagged (`s3a-foundation`) — cut-history served from Rust
through a Next.js cookie→bearer bridge, verified on Fly staging.
Pattern: `rf-domain` types → `rf-application` Port trait + use
cases → `rf-supabase` PostgREST adapter → `rf-api` Axum handlers +
utoipa OpenAPI → generated `types.ts` → Next.js route handlers in
`app/api/v2/**` → UI behind `NEXT_PUBLIC_USE_RUST_CUT_HISTORY`.

S3b scales the same pattern to **inventory**: rolls, material_types,
suppliers, material_suppliers (junction). Full read + write. User
explicitly chose "full inventory read + write" over narrower options:
"cleanliness is way more important".

## What to review

The draft plan at:

`docs/superpowers/plans/2026-04-19-s3b-inventory.md`

## What I need from you

Sign off or push back on:

1. **Task decomposition.** 12 tasks: domain scaffold → 4 aggregates
   end-to-end → Next.js shims → SDK → parity tests → UI cutover →
   smoke → tag. Is the ordering right? Are any tasks too coarse
   (hiding big work) or too fine (creating make-work commits)?

2. **SDK shape.** Per-aggregate wrappers over `openapi-fetch`
   (`rolls.list(...)`, `rolls.create(...)`) instead of raw
   `client.GET("/api/v2/...", {...})`. Worth the ~50 lines of
   boilerplate per aggregate, or over-engineering?

3. **Notification trigger carve-out.** DB triggers stay in
   Postgres — Rust writes rows, Postgres fires notifications. I'm
   calling this simpler than porting trigger logic into
   `rf-application`. Any hidden failure mode you see? (E.g.
   cross-transaction visibility, trigger recursion, migration
   drift.)

4. **`setPreferredSupplier` race window.** The "unset all, set
   one" pattern has no transaction because PostgREST doesn't
   expose ACID. Plan says "acceptable since preferred-supplier
   mutation is rare." Agree? Or should we stash the logic in a
   Postgres function (new migration) and call via PostgREST RPC?

5. **Stats endpoints shape.** Plan proposes
   `/rolls/stats/inventory-value`, `/rolls/stats/low-stock-count`, etc.
   Alternative: `GET /rolls?stats=inventory-value`. Which is
   cleaner for a typed SDK to consume + OpenAPI to describe?

6. **Error mapping for FK cascade deletes.** Deleting a
   material_type that rolls reference fails today at Supabase with
   an FK violation. Plan says 409 Conflict. Should the response
   body include the dependent-row count / example ids to help the
   UI show "can't delete: 5 active rolls use this material"? Or
   is that too much info-leak through an error channel?

7. **Anything missing.** Am I forgetting an aggregate, a hook, or
   a migration that would bite us during the UI cutover? I've
   scoped OUT purchase orders, reorder logic, CSV import, the
   Zustand store refactor, and notification ports — anything else
   that should stay out, or is creeping in implicitly?

## Expected output

Write your review to `.claude/research/s3b-plan/codex-signoff.md`.
Format:

```markdown
# S3b plan review — Codex

## Verdict: [sign-off | conditional sign-off | block]

## Required changes (if any)
- ...

## Nice-to-haves
- ...

## Questions I want answered before we start
- ...
```

Be specific — file paths, task numbers, concrete suggestions. If
you think the plan is good, say so briefly; don't invent issues.
