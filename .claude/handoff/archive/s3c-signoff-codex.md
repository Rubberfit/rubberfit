# S3c plan sign-off — Codex

## Context

S3a (`s3a-foundation`) and S3b (`s3b-inventory`) are shipped. The
Rust backend now serves cut-history + inventory CRUD behind a
Next.js cookie→bearer bridge (`app/api/v2/**`). Pattern:
`rf-domain` → `rf-application` (Port traits + use cases) →
`rf-supabase` (PostgREST adapter) → `rf-api` (Axum handlers +
utoipa OpenAPI) → generated `types.ts` → flag-gated SDK wrappers
(`src/infrastructure/api-client/rf/*`).

S3c ports the last big chunk of the TS service layer: purchase
orders, reorder rules, and inventory CSV import. User
clarifications:
- **PO status is a simple string / UI dropdown.** No workflow
  engine, no approval chains.
- **QuickBooks integration deferred** to a dedicated future phase
  ("S3d: external integrations").

## What to review

Draft at:
`docs/superpowers/plans/2026-04-19-s3c-purchase-orders.md`

Cross-reference against the actual code:
- `src/infrastructure/services/purchaseOrderService.ts` (~60
  methods, ~630 LOC)
- `src/infrastructure/services/reorderService.ts` +
  `reorderCalculations.ts`
- `src/infrastructure/services/csvService.ts`
- `src/application/use-cases/{purchase-orders,reorder}/`
- Migrations:
  `src/infrastructure/supabase/migrations/20240219000004_...`
  (reorder_rules), `20240219000005_...` (purchase_orders),
  `20240219000006_...` (purchase_order_items)
- UI surfaces: `app/dashboard/inventory/{purchase-orders,
  reorder,import}/`

## What I need from you

Sign off or push back on:

1. **Postgres RPC for atomic writes.** Plan adds two new Postgres
   functions: `receive_purchase_order(po_id, items, user_id)` and
   `create_reorder_purchase_order(rule_id, supplier_id, qty,
   unit_cost)`. Goal: atomicity across multi-table writes
   (items update + rolls insert + PO status; or PO insert + item
   insert + rule update). Alternative is sequential writes in
   Rust matching today's non-atomic TS behavior. Which?

2. **Trigger-based totals vs Rust-computed.** Postgres triggers
   today compute `line_total` on item insert/update and roll up
   `purchase_order.total_amount`. Plan keeps those triggers —
   Rust just writes raw rows, reads trigger-populated values
   back via `Prefer: return=representation`. Risk of drift
   during the dual-write (legacy TS + new Rust writing the same
   rows) transition window? Worth duplicating the math in Rust
   to defend against trigger bugs?

3. **Tax calculation port.** Plan ports the TS tax service to
   Rust rather than proxying the existing `/api/tax/...` routes.
   Pure port, ~100 LOC, pulls from `tax_rates` + `suppliers` DB
   tables. Duplicates logic that lives in TS today; on the other
   hand, eliminates a hop. Worth the dup? Or should Rust POST
   to the TS tax endpoint?

4. **Analytics carve-out.** Plan explicitly defers
   `IPurchaseOrderAnalyticsService` — so dashboard reads stay
   on legacy while PO writes go through Rust. Hybrid OK for one
   release cycle, or does that mean the dashboard silently
   shows stale numbers between a v2 write and the legacy read?
   (Triggers keep the written rows consistent — but does the
   analytics service cache anything that's invalidated by a
   write path it doesn't own?)

5. **Status-dropdown + `received` terminal state.** The UI lets
   users click a status dropdown on any PO. Today:
   `received` is a terminal state (RLS blocks further updates).
   If the UI dropdown lets someone pick "received" then wants
   to revert to "ordered" for a typo correction, they can't.
   Is that a bug to fix in S3c or current-behavior we're
   preserving?

6. **Task 10's parity-test depth.** Plan says ~20+ vitest
   scenarios paralleling the SDK methods. The receive flow is
   complex (multi-table writes). Should parity test stubbing
   cover receive explicitly, or is that better left to the
   staging smoke test against live Supabase?

7. **Anything missing.** Am I forgetting an aggregate, a hook,
   or a migration that would bite during the UI cutover?
   Out-of-scope list: QB, approval workflow, async notification
   port, analytics, supplier-rating recompute on receive, CSV
   audit-trail storage. Anything creeping in implicitly?

## Expected output

Write to `.claude/research/s3c-plan/codex-signoff.md`:

```markdown
# S3c plan review — Codex

## Verdict: [sign-off | conditional sign-off | block]

## Required changes (if any)
- ...

## Nice-to-haves
- ...

## Questions I want answered before we start
- ...
```

Be specific — file paths, task numbers, concrete suggestions.
If the plan is good, say so briefly; don't invent issues.
