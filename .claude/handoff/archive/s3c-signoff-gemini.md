# S3c plan sign-off — Gemini

## Context

S3a (`s3a-foundation`) and S3b (`s3b-inventory`) are shipped. Rust
backend serves cut-history + inventory CRUD through Next.js
cookie→bearer shims, flag-gated SDK in TS. Pattern established —
domain / application / supabase / api crate split, PostgREST for
DB, OpenAPI doc split per domain, parity tests before UI cutover.

S3c: purchase orders + reorder + CSV import.

User clarifications:
- **PO status is a UI dropdown** (simple string assignment, no
  workflow engine).
- **QuickBooks deferred** to a later phase.

## What to review

Draft at:
`docs/superpowers/plans/2026-04-19-s3c-purchase-orders.md`

Cross-reference:
- Migrations creating `purchase_orders`, `purchase_order_items`,
  `reorder_rules` in `src/infrastructure/supabase/migrations/`.
- Postgres triggers: `trigger_calculate_po_item_line_total`,
  `trigger_update_purchase_order_totals`,
  `trigger_significant_price_change_notification`.
- Postgres function `generate_po_number()`.
- TS services:
  - `src/infrastructure/services/purchaseOrderService.ts`
  - `src/infrastructure/services/reorderService.ts`
  - `src/infrastructure/services/reorderCalculations.ts`
  - `src/infrastructure/services/csvService.ts`
  - `src/infrastructure/services/taxService.ts`
- Use cases: `src/application/use-cases/{purchase-orders,reorder}/`
- UI: `app/dashboard/inventory/{purchase-orders,reorder,import}/`
- S3b's pattern as the reference: `engine/crates/rf-*` +
  `src/infrastructure/api-client/rf/inventory.ts`.

## What I need from you

Architectural checks:

1. **Domain modeling — PO + Item.** Plan treats `PurchaseOrder`
   and `PurchaseOrderItem` as separate aggregate roots with
   independent CRUD endpoints. Items cascade-delete when the PO
   deletes. Alternative: treat `PurchaseOrder` as the root and
   items as value objects inside it (single `PurchaseOrderWithItems`
   aggregate). Which matches the actual invariants better given
   the receive flow needs item-level updates with different
   semantics than PO-level?

2. **Reorder rule ↔ PO coupling.** `reorder_rule_id` on
   `purchase_orders` with `SET NULL` on rule delete. Rule knows
   about `last_triggered_at`. No reverse references beyond that.
   Is that modeling tight enough, or is the "which PO came from
   which rule" lineage something the UI will need and we're
   under-modeling it?

3. **Status enum across aggregates.** PO status is defined in
   `rf-domain::procurement::PurchaseOrderStatus`. Parts of the
   app care about subsets — reorder only triggers for active
   materials, receive flow only touches `ordered` POs. Should
   the domain carry sub-types (e.g. `OrderedPurchaseOrder`) or
   rely on the use-case layer to enforce the right status
   before acting? The Rust type-system could encode this but at
   real cost.

4. **Tax service location.** Plan ports the tax calc into
   `rf-application::tax`. Is that a good home, or should it live
   under `rf-application::procurement::tax`? (i.e. is tax calc
   cross-cutting or PO-specific in practice?) Right now only POs
   call it, but future quotes / invoices might.

5. **Postgres RPCs and schema-change spirit.** Plan adds two new
   DB functions. S3b plan had "no schema changes" as a non-goal.
   Are we breaking that spirit, or is adding Postgres functions
   fair game as long as we don't change tables? Call out if you
   see a cleaner design that avoids new functions.

6. **Concurrent PO number generation.** `generate_po_number()`
   uses a per-year sequence. Under concurrent PO creation from
   multiple API instances (Fly autoscale beyond 1 machine), does
   the function stay race-safe? Confirm by reading the function
   body — if it uses `SELECT MAX(...) + 1` it's broken; if it
   uses an actual Postgres sequence object it's fine.

7. **CSV review UX.** The TS CSV flow parses client-side, shows
   a review table where users edit rows, THEN submits. Plan says
   "send reviewed JSON rows to `/api/v2/import/rolls`, not raw
   CSV." That means Rust needs to accept a JSON shape, not just
   CSV bytes. Fine, but worth being explicit about. Any hidden
   cost to abandoning server-side CSV parsing? (E.g. we want to
   later add audit storage for the original CSV?)

8. **Receive flow DB transaction.** Plan adds
   `receive_purchase_order(po_id, items, user_id)` Postgres
   function. Inside that function: UPDATE items, INSERT rolls,
   maybe UPDATE purchase_orders.status. If any step fails, the
   whole thing rolls back. Does this conflict with existing
   Postgres triggers (e.g. rolls depletion trigger, PO total
   rollup trigger)? Any deadlock risk when the function's
   transaction contends with a concurrent PO edit?

9. **Sequencing of UI cutover.** Plan splits Task 11 into 3
   commits (PO / reorder / import). Is that the right blast
   radius? Or should we do one UI commit per surface per commit
   to minimise rollback-lag? (S3b's 10a/b/c pattern worked fine
   — probably OK for S3c too, but verify the boundaries.)

10. **Things I looked at that are fine.** Anything in the plan
    that you explicitly verified and want to mark as non-issues,
    so I know coverage is complete.

## Expected output

Write to `.claude/research/s3c-plan/gemini-signoff.md`:

```markdown
# S3c plan review — Gemini

## Verdict: [sign-off | conditional sign-off | block]

## Required changes (if any)
- ...

## Nice-to-haves / follow-ups
- ...

## Things I looked at that are fine
- (brief)

## Questions for Claude
- ...
```

Don't spare blunt feedback. Catch what one reviewer misses.
