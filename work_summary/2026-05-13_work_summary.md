# 2026-05-13 — Step 7c-1: idempotent PO receipts + safety net

**Branch:** `feature/DDD-implementation` &nbsp;·&nbsp; **Commit:** `2a34881b` &nbsp;·&nbsp; **DDD queue:** 8 / 10 services migrated (no change — 7c-1 is a depth-add on an existing migration, not a new service migration)

## What this is

The third installment of the receive-PO refactor — 7c-1 closes the duplicate-on-retry hole that 7b's reconciliation view detected but couldn't prevent. The PO entity's `recordReceipt(lineNumber, deltaSqm)` is purely additive (`quantity_received_sqm += delta`); without an idempotency guard, a retry of the same submission re-applies every delta and creates duplicate rolls. 7c-1 introduces a **receipt-as-source-of-truth** data model where each operator-intent receipt event lives as a row in a new `po_item_receipts` table, with `(item_id, idempotency_key)` UNIQUE as the dedup anchor.

The conversation thread that landed this took ~3 hours of design discussion, one Codex pre-flight review, and one significant pivot from the initial sketch.

## Design decisions worth recording

### Receipt-as-source-of-truth (vs. denormalized counter only)

Pre-7c-1, the system had **no per-receipt history at all**. Every receipt mutated `purchase_order_items.quantity_received_sqm` in place; the prior value was lost. The only audit was `received_date` (last receipt date, overwritten) and `updated_at` (last touch, overwritten).

7c-1 introduces `po_item_receipts` as one row per receipt event. This is meaningfully more than "add idempotency" — it's the system's first per-receipt audit row. The idempotency key piggybacks on the row that already needed to exist for audit purposes.

### Option A (one table, 1:N item → receipts) vs Option B (parent + lines)

We discussed both. **B's only durable advantage was batch-level metadata** (packing-list URL, carrier, tracking number) — which the system doesn't capture today and may never. A is leaner now and retrofittable later by adding a parent table with batch IDs back-grouped from `(po_id, created_by, created_at)`. Picked **A**.

The user pushed back on a "1:1 between item and receipts" intuition; the partial-receipts case (PO ordered 100 sqm, supplier ships 30 Monday + 30 Tuesday + 40 Friday — three receipts for one item) makes 1:1 a non-starter. The 1:1 actually wanted lives at a different level: **`(item_id, idempotency_key)` is uniquely 1:1 with a receipt row** (the constraint, not the entity cardinality). Items remain 1:N with receipts; the dedup is on the tuple.

### Insert-receipt-FIRST + state markers (vs. transactional Postgres function)

Codex pre-flight flagged the obvious race in "insert receipt first, then apply entity": if the receipt INSERT succeeds and the subsequent PO update fails, a same-key retry hits the UNIQUE conflict, skips the apply again, and the PO is permanently under-received. **A Postgres transactional function would solve this** by wrapping both writes in one transaction — but at the cost of duplicating entity invariants (status auto-flip, `actualDeliveryDate` stamping) across TS and SQL. The DDD layering rule (infrastructure never owns business logic) rules that out.

The pragmatic answer: keep the insert-first sequence in TS, and add an `applied_at` state marker that's stamped AFTER `repo.update(po)` returns successfully. The rare under-applied row (receipt landed, apply lost) is now an observable state — surfaced by a dedicated `po_receipts_pending_apply` view for admin reconcile (7c-2 will give it a UI).

### Typed roll-intent columns (vs. jsonb)

The receipt row needs to capture what roll the operator wanted, for the eventual 7c-2 admin replay path. Codex flagged jsonb as load-bearing: a schema change between original receipt and admin retry could silently alter what roll gets created. Used 7 nullable typed columns instead (`roll_width_mm`, `roll_length_mm`, `roll_thickness_mm`, `roll_color`, `roll_location`, `roll_cost_per_sqm_cents`, `roll_notes`) + a `roll_requested boolean` flag. Schema-stable, immune to drift.

### Two reconciliation views (vs. one with discriminator)

Three race windows survive the insert-first dance: receipt landed but apply lost (`po_receipts_pending_apply`), apply succeeded but roll-create failed (`po_receipts_pending_roll_creation`), and stamp-after-stamp-lost (handled by the second view's `NOT EXISTS` against `rolls`). The first two need different admin actions — re-apply on the entity vs. replay createRoll — so two views beats one union with a discriminator column. Each view's query and its consumer stay simple.

### Frontend key lifecycle (the dialog table)

Component state, regenerate on (a) form mount, (b) any meaningful field change, (c) successful response. Key stays put on error → retry of the same intent dedups. **Different from Stripe's model** — Stripe expires keys after 24h because their keys live in a side cache; ours live on permanent audit rows with composite UNIQUE scoping, so there's no global cache to bound and no expiration needed.

## What shipped

| Layer | File | Net |
|-------|------|-----|
| Schema | `migrations/20260421000004_schema_commerce.sql` | +70 / -0 (new `po_item_receipts` table) |
| Schema | `migrations/20260421000007_indexes.sql` | +14 / -0 (3 partial indexes) |
| Schema | `migrations/20260421000009_rls_policies.sql` | +17 / -0 (3 policies, no DELETE) |
| Schema | `migrations/20260513000001_po_receipts_reconciliation.sql` | +154 / -65 (rewritten — two views) |
| Repo | `purchase-orders.repository.interface.ts` | +70 / -0 (3 new methods + 2 types) |
| Repo | `purchase-orders.repository.ts` | +76 / -1 (impls; supabase `.upsert` with `ignoreDuplicates`) |
| Service | `purchase-order.service.interface.ts` | +45 / -1 (extended ReceiptDelta + result types) |
| Service | `purchaseOrderService.ts` | +61 / -19 (idempotent recordReceiptsByItemId) |
| Use-case | `receive-purchase-order.use-case.ts` | +53 / -7 (idempotencyKey + skip-already-applied + stamp) |
| Helper | `po-input-conversion.ts` | +51 / -0 (buildRollIntent extraction) |
| Action | `app/actions/purchase-orders.ts` | +9 / -1 (idempotencyKey Zod) |
| Tests | `tests/services/purchase-order.service.test.ts` | +318 / -0 (NEW — in-memory repo fake) |
| Tests | `tests/use-cases/receive-purchase-order.use-case.test.ts` | +333 / -52 (idempotency replay + stamp tests) |
| Tests | `tests/actions/purchase-orders.test.ts` | +45 / -10 (idempotencyKey required + malformed) |
| Tests | `tests/use-cases/po-input-conversion.test.ts` | +43 / -0 (buildRollIntent unit tests) |

**16 files, +1290 / -104.**

## Test coverage

- 1727 passing (was 1709 — **+18 net**), same 9 pre-existing failures (architecture + UI render — none related to receive flow)
- 0 typecheck errors
- 10 lint warnings (baseline unchanged)
- New tests cover: receipt-INSERT-first sequencing, ON CONFLICT skip semantics, applied_at stamp ordering, repo.update failure leaving applied_at NULL, mixed partial-replay, idempotencyKey threading, stamp-after-createRoll, stamp-failure-is-non-fatal, schema validation for malformed/missing keys

## Acceptance criteria (vs the 7c-1 plan)

- [x] `po_item_receipts` table with composite UNIQUE idempotency anchor
- [x] Typed roll-intent columns (no load-bearing jsonb)
- [x] Two state markers: `applied_at`, `roll_created_at`
- [x] RLS policies (SELECT/INSERT/UPDATE; no DELETE — append-only)
- [x] `po_receipts_pending_apply` view (NEW)
- [x] `po_receipts_pending_roll_creation` view (rewritten per-receipt; NOT EXISTS guard)
- [x] Service `recordReceiptsByItemId` idempotent end-to-end
- [x] Use-case skips roll creation for `alreadyAppliedItemIds`
- [x] Use-case stamps `roll_created_at` after `createRoll` (non-fatal on stamp failure)
- [x] Action requires `idempotencyKey: z.string().uuid()`
- [ ] Client-side UUID generation (deferred — see below)

## Known gap surfaced during implementation

**The receive-PO UI doesn't call the receive use-case yet.** Today the "Receive goods" dropdown routes through `purchaseOrdersSdk.receive()`, which delegates to either the Rust API (`POST /api/v2/po/{id}/receive`) under the `NEXT_PUBLIC_USE_RUST_PROCUREMENT` flag, or `legacyPos.receivePurchaseOrder()` otherwise.

7a/7b/7c-1's `receivePurchaseOrder` server action exists, has the idempotency guard, and requires `idempotencyKey` via Zod — but nothing in `app/dashboard/inventory/purchase-orders/` imports it. So 7c-1's safety net is in place at the action / use-case / service / DB layer, but the live UI path doesn't exercise it.

This means:
- Backend dedup is solid for any caller using the action (server-side scripts, integration tests, future UI)
- Live operator double-clicks still go through the SDK / Rust / legacy path with no idempotency
- A separate "migrate receive UI from SDK to use-case path" PR is the natural pairing — when it lands, the schema's required `idempotencyKey` forces the client to generate one, and 7c-1's safety net protects every receive

Surfaced this in the plan as Task #84 "deferred" rather than build a UUID generator into a form that doesn't reach the protected path.

## Codex pre-flight review (verbatim BLOCKER + how it resolved)

> **Q1 Race — Blocker**: The insert-receipt-first conflict skip can permanently strand a receipt without updating `purchase_order_items.quantity_received_sqm`. If PO persistence fails after the receipt INSERT succeeds, a same-key retry will skip the entity apply again and the PO is permanently under-received. An "under-applied" reconciliation surface needs to be part of 7c-1, not deferred. Minimum fix: add an `applied_at timestamptz` column to `po_item_receipts`; populate it after PO persistence succeeds; surface rows where `applied_at IS NULL`. Without this the idempotency mechanism is incomplete — it prevents duplicate rolls but introduces silent data loss on the PO-quantity side.

Resolved by adding `applied_at` + the `po_receipts_pending_apply` view. The state marker model is what Codex pushed for and what the plan landed on.

## What 7c-2 looks like

Reading from the data model 7c-1 establishes:

- `ReconcilePendingApplyUseCase` — load receipt, re-run `po.recordReceipt(lineNumber, qty_sqm, …)`, stamp `applied_at`. Idempotent itself via the receipt row's existing identity.
- `ReconcilePendingRollCreationUseCase` — load receipt, replay `buildCreateRollProps` from the typed roll-intent columns + PO-item fallbacks, call `rollService.createRoll`, stamp `roll_created_at`.
- Two server actions wrapping the use-cases. RBAC: new `reconcileReceipts: ["admin"]` permission.
- `/dashboard/admin/inventory/po-reconciliation` — server component reading both views, two tables, "Retry" buttons per row.
- `ROUTE_PERMISSIONS` entry for the new admin route.

Everything 7c-2 needs is in the DB now. It's purely additive on top of 7c-1.

## Next session pickup options

1. **7c-2** — admin reconcile UI + actions (closes the operator-facing safety story)
2. **FE migration off `purchaseOrdersSdk.receive()`** — wire the live "Receive goods" UI to the `receivePurchaseOrder` server action so 7c-1's idempotency actually fires for end users
3. **Resume DDD queue** — `cutService` is the smallest remaining migration (8/10 → 9/10)

The FE migration is the most directly user-impactful (it's what actually plugs the duplicate-on-retry hole for real operators), but it's a UI-shaped piece of work distinct from the backend DDD line. 7c-2 is the natural extension of the work just shipped. `cutService` keeps the DDD migration momentum going.
