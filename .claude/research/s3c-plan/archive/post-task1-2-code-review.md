# S3c Task 1 + Task 2 Code Review

Reviewer: code-reviewer agent
Scope: Rust workspace only (Task 1 scaffold + migration, Task 2 PO/Item CRUD). Plan constraints from `docs/superpowers/plans/2026-04-19-s3c-purchase-orders.md`.

---

## Critical

None.

---

## Major

### M1. `Received` reachable on CREATE — bypass of terminal-via-receive-only rule
**File:** `engine/crates/rf-application/src/procurement/purchase_orders.rs:193-206`
**Also:** `engine/crates/rf-supabase/src/purchase_orders.rs:165` (passes it through to INSERT).

`CreatePurchaseOrderUseCase::execute` accepts `NewPurchaseOrder { status: Option<PurchaseOrderStatus>, .. }` and never rejects `PurchaseOrderStatus::Received`. A caller can `POST /api/v2/po { "supplier_id": "…", "status": "received" }` and land a PO in `received` state without going through the receive flow — skipping roll creation and `actual_delivery_date` stamping, exactly the integrity bug the plan says S3c fixes.

The domain-layer doc on `PurchaseOrderStatus` says "the `/api/v2/po/{id}/receive` endpoint is the only writer". That invariant leaks on CREATE.

**Fix (minimal):** reject `Received` at the use-case boundary.

```rust
// In CreatePurchaseOrderUseCase::execute, before generate_number:
if matches!(new.status, Some(PurchaseOrderStatus::Received)) {
    return Err(AppError::Conflict("RECEIVED_REQUIRES_RECEIVE_FLOW".into()));
}
```

A sibling test in `purchase_orders.rs` should lock it in (create with `status = received` returns Conflict with `RECEIVED_REQUIRES_RECEIVE_FLOW`).

Task 3 will add the same rejection on the status-update path; mirroring it on CREATE closes the loop so the invariant can't be bypassed from either direction.

---

## Minor

### m1. `UpdatePurchaseOrderBody → PurchaseOrderUpdate` conversion can never clear nullable columns
**File:** `engine/crates/rf-api/src/procurement/purchase_orders.rs:221-235`, mirror in `po_items.rs:137-151`.

`PurchaseOrderUpdate.order_date: Option<Option<String>>` was designed to distinguish "omit" (`None`) from "set null" (`Some(None)`). The handler conversion does `order_date: b.order_date.map(Some)` — this produces `None` for both omitted AND explicit-null JSON, so there's no wire representation for "clear this column". The adapter's `v.map(Value::String).unwrap_or(Value::Null)` null branch is dead code in practice.

This is the same trade-off already in S3b inventory handlers (documented at `inventory/material_types.rs:94-102`). Not a S3c regression, but mentioning it so the team knows the double-`Option` in the application struct doesn't buy anything today. If the UI ever needs to clear `notes`/`payment_terms`/etc., a `serde_with::rust::double_option` attribute or a custom `Deserialize` visitor is the proper fix.

### m2. OpenAPI drift test coverage doesn't assert new procurement paths
**File:** `engine/crates/rf-api/src/openapi.rs:227-313` (in-crate tests) and `engine/crates/rf-api/tests/openapi.rs`.

The in-crate `merged_spec_lists_cut_history_routes` test exists; there's no matching `merged_spec_lists_procurement_routes` that asserts `/api/v2/po` and `/api/v2/po/{id}/items` show up in the merged spec. The tag assertion is there; path coverage is not. Adding a 4-line test would catch a future handler whose `#[utoipa::path]` silently drops off the `ProcurementDoc`.

### m3. `dummy_procurement_factory()` in integration tests is a real `SupabaseProcurementFactory`
**Files:** `engine/crates/rf-api/tests/{rolls,material_types,material_suppliers,suppliers}.rs` (four tests).

The factory is instantiated pointing at `SUPABASE_URL` (a test URL that never resolves). Because none of those tests invoke procurement routes, nothing calls the factory — but a careless future handler that accidentally touches `state.procurement_factory` in, say, a shared middleware would make tests hit the network and flake.

Defensively, a `FakeProcurementFactory` that returns `AppError::Infrastructure("unused in this test suite")` on every method would fail loudly. Low priority — fine for now since the usage boundary is explicit.

### m4. Sequence cold-start window is only "almost" race-safe
**File:** `src/infrastructure/supabase/migrations/20260419000001_…_rpc_shells.sql:49-94`.

The DO block at lines 99-116 pre-seeds sequences for every existing year, so the first `nextval()` at steady state is uncontested. The lazy creation path inside `generate_po_number()` itself (lines 63-89) has a narrow race on the `NOT EXISTS` check for a *new* year — two callers crossing midnight on Dec 31 → Jan 1 both see no `po_number_seq_27`, both `CREATE SEQUENCE IF NOT EXISTS` (idempotent), both run `setval(seq, 0, false)`. Sequence uniqueness still holds (Postgres guarantees `nextval` returns distinct values per sequence) so nothing actually breaks. Worth a comment, not a rewrite.

A belt-and-suspenders hardening: wrap the CREATE + setval in `LOCK TABLE purchase_orders IN EXCLUSIVE MODE` or a dedicated advisory lock. Probably overkill for a once-per-year cold start.

### m5. `valid_approval` CHECK constraint not handled distinctly on CREATE
**File:** `engine/crates/rf-supabase/src/purchase_orders.rs:283-291` + DB migration `20240219000005_create_purchase_orders_table.sql:32-35`.

If a caller POSTs `{ status: "approved" }` on CREATE without `approved_by` + `approved_at`, the DB CHECK fires → PostgREST returns 23514 → adapter maps to `AppError::Conflict("CHECK_VIOLATION")`. User sees a generic 409 `CHECK_VIOLATION`. Not wrong, but not helpful either.

Once M1 is fixed, this becomes the last corner where raw status-on-create leaks an unfriendly error. Not worth a dedicated code today (M1's conflict covers the one real case) but flag for Task 3 to DRY the message.

### m6. Search-term escape strips `,` and `*` but not `()`
**File:** `engine/crates/rf-supabase/src/purchase_orders.rs:280-282`.

Same pattern as `suppliers.rs` / `rolls.rs` — pre-existing across S3b. User-supplied `search` containing a literal `)` in the `or=(…)` group currently gets forwarded and PostgREST will 400. No injection risk (PostgREST parses strictly), but a noisier UX. Not a S3c regression.

---

## Nits

- `engine/crates/rf-supabase/src/purchase_orders.rs:165`: `status: new.status.map(status_str)` duplicates the `match` body in the free-function `status_str` vs. the domain's `PurchaseOrderStatus::as_str()`. One could go — prefer the domain method and drop the adapter-local `status_str`.
- `engine/crates/rf-application/src/procurement/purchase_orders.rs:205`: clamping `limit > 200` down to 200 is good; document the invariant in `PurchaseOrderFilters` so reorder/etc. adapters reuse the same ceiling.
- `engine/crates/rf-api/src/procurement/po_items.rs:242,282`: `Path((_po_id, item_id))` silently ignores the `po_id` segment. Consider asserting `item.purchase_order_id == po_id` after fetch, or at least documenting that the parent path is just URL shape.
- `engine/crates/rf-supabase/src/po_items.rs:88-90`: comment claims "the trigger overwrites whatever we pass" — true for `quantity_sqft/unit_cost` INSERTs but subtly false for a `line_total`-only UPDATE (which the trigger doesn't fire on). Task 2's update path never sets `line_total` directly, so fine — but the comment could be sharper.

---

## Verified fine

- **Layer boundaries:** rf-domain has only `serde`. rf-application only uses `async_trait` + `serde` + `thiserror`; no `reqwest` / `axum`. rf-supabase is the only reqwest user. rf-api is the only Axum user. Clean.
- **`PurchaseOrderUpdate` excludes `status`** (field audit passed) — Task 3 status path is gated.
- **`PurchaseOrderItemUpdate` excludes `quantity_received` + `received_date`** — receive-flow invariant holds.
- **`allowed_targets_from()` never lists `Received`** — explicit test at `procurement.rs:277-287` iterates the full non-received variant set; `Received.allowed_targets_from()` asserted empty.
- **Per-year sequence migration semantics** — `setval(seq, existing_max, true)` with `is_called=true` correctly makes `nextval()` return `existing_max + 1`; `setval(seq, 1, false)` correctly makes `nextval()` return `1` on an empty year. Pre-seed DO block covers existing data.
- **RPC shells** — `receive_purchase_order(UUID, JSONB, UUID)` and `create_reorder_purchase_order(UUID[], UUID, JSONB, UUID, BOOLEAN)` signatures match the plan. Both `RAISE EXCEPTION` with `feature_not_supported` so accidental early wiring fails loudly.
- **RLS / per-request JWT** — `SupabaseProcurementFactory::{purchase_orders, po_items}` each mint a fresh `PostgrestClient` from `auth.raw_jwt`. No service-role key path. No client caching.
- **PostgREST RPC call shape** — `post::<_, String>("/rest/v1/rpc/generate_po_number", &Empty{})` with body `{}` is the correct shape for a zero-arg scalar-returning RPC; PostgREST returns a JSON string.
- **`Prefer: return=representation`** — stamped unconditionally by the client's `post` / `patch` / `delete`, so triggers' populated `line_total` / `subtotal` / `total_amount` round-trip.
- **`CsvImportRow`** correctly allows `material_type_id: Option<MaterialTypeId>` with a test asserting null deserialization.
- **Line-number race → `LINE_NUMBER_RACE` conflict code** — the read-max-then-insert window is a known race; unique violation is caught and mapped to a dedicated code so the UI auto-retries.
- **Error hygiene at HTTP boundary** — `AppError::Infrastructure` collapses to "internal error" 500 (no adapter string leakage to clients). Conflict codes exposed are SCREAMING_SNAKE machine codes, no PII.
- **Unit test coverage on use cases** — happy path + negative cases (blank supplier, negative tax, bad ISO date, zero quantity, blank description, description trim, not-found on get/update/delete, limit clamp, list filter).
- **Integration tests updated** — all four tests (rolls/material_types/material_suppliers/suppliers) pass a `dummy_procurement_factory` through `AppState::with_factories`. Compiles and doesn't hit procurement routes.
- **No Option<Option<Copy>> footguns remaining** — the 2026-04-17/18 clippy fixes held; the new po_items/purchase_orders code uses `if let Some(Some(v))` on already-owned patches, no borrow/move trouble.

---

## Recommendation

**Ship after M1 is fixed.** M1 is a real correctness gap (terminal-via-receive-only invariant escapes through CREATE); the fix is one `if matches!(…)` + one test. Everything else is minor or pre-existing cross-cutting.

Task 3 (status transitions) should reuse the same `RECEIVED_REQUIRES_RECEIVE_FLOW` conflict code on the update path so the client sees a consistent error shape regardless of entry point.
