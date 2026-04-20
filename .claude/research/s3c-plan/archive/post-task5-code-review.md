# S3c Task 5 — Post-implementation Code Review

Scope: uncommitted diff since `9746b5b`. Files: migration
`20260419000002_s3c_receive_purchase_order_rpc.sql`,
`engine/crates/rf-application/src/procurement/receive.rs`,
`engine/crates/rf-supabase/src/receive.rs`,
`engine/crates/rf-api/src/procurement/receive.rs` + wire-up.

## Findings

### Major

**M1. Notification fires on partial receipts — regression vs legacy TS.**
`engine/crates/rf-application/src/procurement/receive.rs:139-152`
unconditionally calls `notifications.send_po_received(&po)` whenever
`po_port.get` returns `Some`. The legacy path
(`src/application/use-cases/purchase-orders/receive-purchase-order.use-case.ts:40`)
gates the notification on `!result.partialReceipt` so users are not
pinged mid-flow on a multi-shipment PO. This is a behavior divergence
parity tests will flag in Task 10. Guard the notification on
`receipt.partial == false`, matching the legacy use case.

**M2. `RAISE EXCEPTION` SQLSTATE = 22023 is generic and falls through
to substring matching only.**
`src/infrastructure/supabase/migrations/20260419000002_s3c_receive_purchase_order_rpc.sql:76,80,116`
— all three sentinels use 22023 (`invalid_parameter_value`). The Rust
adapter at
`engine/crates/rf-supabase/src/receive.rs:109-135` only switches on
23505/23503/23514; 22023 lands in the string-match branch. Any
PostgREST envelope change that re-wraps the message (nested error,
localized prefix, HTML escaping) would silently drop the mapping and
these errors would surface as `AppError::Infrastructure` → HTTP 500
rather than 409. Mitigation: adopt a project-specific SQLSTATE in
the PU class (e.g. `P0001` with a sentinel prefix on the message, or
use `USING ERRCODE = 'P0001', MESSAGE = 'PO_ALREADY_RECEIVED'`) and
match on both code and message prefix. Minimum: add a regression
test in `rf-supabase::receive::tests` that asserts the JSON body
PostgREST actually sends today (e.g. `{"code":"22023","message":"..."}`)
maps correctly — the current tests fabricate bodies, not live shapes.

### Minor

**Mn1. `trigger_update_purchase_order_totals` fires N times per receive.**
Each item UPDATE triggers a `SUM(line_total) WHERE purchase_order_id=...`
followed by a PO UPDATE
(`src/infrastructure/supabase/migrations/20240219000006_create_purchase_order_items_table.sql:75-107`
+ trigger at :110). During a receive only `quantity_received` and
`received_date` change; `line_total` stays fixed, so every trigger
invocation is a no-op SUM + a redundant `updated_at` bump. No
correctness bug — performance smell for receives with many line items.
Optional: inside the RPC, temporarily `ALTER TABLE ... DISABLE
TRIGGER trigger_update_purchase_order_totals` is heavy-handed; a
cleaner fix is gating the trigger on `TG_OP = 'UPDATE' AND
NEW.line_total IS DISTINCT FROM OLD.line_total`. Defer unless
receive latency shows up in metrics.

**Mn2. `PO_ITEM_NOT_FOUND` code carries item_id via substring split.**
`engine/crates/rf-supabase/src/receive.rs:126-131` does
`msg.split("PO_ITEM_NOT_FOUND").nth(1)` and appends. Clients that
need the id must regex the prefix — the header comment on the module
says so but there is no test asserting the exact output shape. Add a
test like `PO_ITEM_NOT_FOUND (item_id=abc)` → `code ==
"PO_ITEM_NOT_FOUND (item_id=abc)"` so a future refactor cannot
silently change the suffix.

**Mn3. PG message substring match is loose.**
`map_receive_error` at
`engine/crates/rf-supabase/src/receive.rs:118-131` stringifies the
whole `PostgrestError` (whose Display is `"Supabase returned
non-success status {status}: {body}"`) and runs `contains`. If
anything in the body, headers, or status description happens to
contain `PO_ALREADY_RECEIVED` (say, future audit logging echoing
back the originating error), the dispatch would trip. Match on the
JSON `message` field specifically rather than the full error string.

**Mn4. `line_total` consistency check vs accumulated receives.**
`purchase_order_items` has
`CONSTRAINT consistent_line_total CHECK (ABS(line_total -
(quantity_sqft * unit_cost)) < 0.01)`
(20240219000006:24). Our receive UPDATE does not touch `line_total`,
`quantity_sqft`, or `unit_cost`, so the constraint passes. The
`trigger_calculate_po_item_line_total` fires only on
`BEFORE UPDATE OF quantity_sqft, unit_cost`, so it does not recompute
on `quantity_received` updates — correct. Verified fine but worth a
parity test fixture where a partial receive is followed by an item
edit (caller changes quantity_sqft after partial), because
`quantity_received` may then exceed the new `quantity_sqft` and
trip the `valid_received_quantity` CHECK.

### Nits

**N1. `CURRENT_DATE` vs `now()` / ISO timestamps.** The function uses
`CURRENT_DATE` for `received_date` and `actual_delivery_date`; the
legacy TS used `new Date().toISOString()` (UTC) coerced to DATE. Both
resolve to UTC under Supabase defaults, so parity holds — but
document the timezone assumption inline so a future Supabase
timezone change does not silently drift.

**N2. `completed_at` returned from RPC vs Rust's `now()`.** The RPC
sets `completed_at = now()` only when the status flips; on a partial
receive the field is `NULL` → `Option::<String>::None`. Handler
passes through. Fine. Record a golden fixture where
`partial == true && completed_at == null`.

**N3. `PO with zero items` degenerate case.**
`bool_and()` over zero rows returns NULL → `IF fully_received` skips
the status flip and `NOT COALESCE(fully_received, false)` makes
`partial_receipt = true`. Defensible default; but schema does not
enforce items-per-PO > 0, so a receive against an itemless PO would
return `{items_received: 0, partial: true}` with nothing done. Add a
guard at the top of the function, or explicitly document that the
API layer is responsible for rejecting receives with empty request
bodies (it does — `receive.rs:110-114`).

**N4. Supplier name lookup can race.** Lookup at
migration line 85 happens after the PO lock but is unlocked — a
concurrent UPDATE to `suppliers.name` could yield a different value
than a later roll insert. Harmless for denormalization purposes, but
worth noting. Not worth fixing.

**N5. `ReceiveRollData` at the HTTP layer is mirrored twice.**
`rf-api/src/procurement/receive.rs:32-44` duplicates the struct from
`rf-application::procurement::ReceiveRollData`. The `From` impl
bridges them. Not wrong — the comment on `ReceiveReceiptDto`
justifies it — but the split adds maintenance cost with no current
evolution pressure. Collapse once a second consumer needs a
different shape.

### Verified fine

- `FOR UPDATE` lock at migration line 62 is the very first
  write-touching statement; all item/roll writes follow. Gemini
  sign-off satisfied.
- `bool_and(quantity_received >= quantity_sqft)` correctly detects
  completion and respects partial receipts.
- `actual_delivery_date` stamped only on completion (migration
  line 208) — plan conformance.
- `quantity_received` is accumulated, not overwritten (migration
  line 124). Legacy parity.
- `SECURITY INVOKER` is the default; the migration does NOT declare
  `SECURITY DEFINER`, so RLS on all three tables applies to the
  caller. Combined with the JWT-forwarded PostgREST client, the
  `rolls.user_id = user_id` parameter does satisfy the
  `auth.uid() = user_id` WITH CHECK on rolls because the caller's
  JWT `sub` == the `actor` threaded through the handler
  (`engine/crates/rf-api/src/procurement/receive.rs:124,151`).
- `purchase_orders` UPDATE WITH CHECK was relaxed in
  `20260412000003_fix_purchase_orders_update_rls.sql` — the
  flip-to-`received` path does not get RLS-rejected.
- `purchase_order_items` UPDATE RLS predicate requires the PO to be
  non-terminal; updates happen before the status flip, so it holds.
- CHECK violation is checked BEFORE message match in the adapter —
  correct defensive ordering (receive.rs:109-116).
- Fire-and-forget notification via `tracing::warn!` on failure
  matches the approve path.
- 6 `rf-application` tests cover empty, negative quantity, blank
  item_id, notification fires, RPC error surfaces, notification
  failure does not rollback.
- 4 `rf-supabase` tests cover each error-mapping branch.
- Layer boundaries clean: `ReceivePort` in rf-application, adapter in
  rf-supabase, handler in rf-api. No Supabase types leak up.
- HTTP-level validation covers empty items, negative qty, blank
  item_id, NaN/Infinity (`is_finite() && >= 0.0`).
- JWT threading: `auth.claims.sub` → `actor` → RPC `user_id` →
  `rolls.user_id`. Verified at receive.rs:124 + :151.
- Actor column is the verified `sub` claim, not client-controlled.
- No service-role usage anywhere in the new code.
- `roll_data` absent → no roll insert (migration line 136); covers
  the quantity-only receive case the plan calls out.

## Golden fixtures to record for S3d / Task 10 parity

1. Partial receive followed by a second receive that completes the PO
   (verifies accumulation + delayed status flip).
2. Full receive in one call (status flip + `actual_delivery_date` +
   `completed_at`).
3. Receive with `roll_data` omitted on one item and present on
   another (mixed quantity-only + roll-creating).
4. Receive against a non-existent PO → 409 `PO_NOT_FOUND`.
5. Receive against an already-received PO → 409 `PO_ALREADY_RECEIVED`.
6. Receive with an item_id that does not belong to the PO → 409
   `PO_ITEM_NOT_FOUND (item_id=...)`.
7. Receive with `quantity_received` larger than
   `quantity_sqft - quantity_received_already` → 409
   `CHECK_VIOLATION` (trips `valid_received_quantity`).
8. Cross-midnight receive (sanity for `CURRENT_DATE` vs
   `now()` parity with legacy).
9. Partial receive → assert notification NOT sent (once M1 is
   fixed).

## Red-flag summary

- M1 and M2 are blockers on Task 10 parity if not addressed.
- No panics or unsafe PG field access — `jsonb_array_elements`
  tolerates mixed shapes; `->>` returns NULL for missing keys which
  the COALESCE fallbacks catch.
- No interaction hazard with `trigger_update_purchase_order_totals`
  beyond the perf nit in Mn1.
