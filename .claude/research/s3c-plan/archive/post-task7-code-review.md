# Post-Task 7 code review — reorder → PO (3 HTTP paths + RPC + notification)

Scope: migration `20260419000003`, `rf-application::procurement::create_reorder_po`, `rf-supabase::create_reorder_po`, three handlers in `rf-api::procurement::create_reorder_po`, router + factory wiring.

---

## Critical

None. The transactional flow is correct, the SQLSTATE space is distinct (P0001–P0004 receive vs P0010–P0012 reorder), JSONB cast errors fail loud rather than silently, and there is no `SECURITY DEFINER` on the RPC so RLS + `auth.uid()` still apply to the invoker's JWT.

---

## Major

### M1 — `rule_count` comparison is wrong when `rule_ids` contains duplicates
File: `src/infrastructure/supabase/migrations/20260419000003_s3c_create_reorder_purchase_order_rpc.sql:77-91`

```sql
SELECT COUNT(*) INTO rule_count
FROM (SELECT id FROM reorder_rules
      WHERE id = ANY(rule_ids) ORDER BY id FOR UPDATE) locked;
...
IF rule_count <> array_length(rule_ids, 1) THEN
  RAISE EXCEPTION 'RULE_NOT_FOUND ...';
```

If a caller sends `rule_ids = ['rr-1','rr-1']` (two copies of the same real rule), the subquery locks one row (`count = 1`) but `array_length = 2`, so the RPC raises RULE_NOT_FOUND. That's arguably fine — duplicates ARE a caller bug — but the message is misleading (rule IS found, it's just duplicated). Pick one:
- (a) `SELECT COUNT(DISTINCT id)` on the input side: `WITH distinct_ids AS (SELECT DISTINCT unnest(rule_ids) AS id) ...` and compare against that count, or
- (b) Explicit dedup check at the top: `IF array_length(rule_ids,1) <> (SELECT COUNT(DISTINCT x) FROM unnest(rule_ids) x) THEN RAISE 'DUPLICATE_RULE_ID'`.

Option (b) gives a clear SQLSTATE (reserve P0013). Preferred. Task 7's Rust tests also don't exercise duplicates — add a use-case test `row_mode_rejects_duplicate_rule_ids` once the SQL path is firm.

### M2 — Batch handler is not atomic and swallows receipts on partial failure
File: `engine/crates/rf-api/src/procurement/create_reorder_po.rs:148-191`

```rust
for item in incoming.items {
    let receipt = run_use_case(...).await?;   // `?` aborts the loop
    receipts.push(receipt.into());
}
Ok((StatusCode::CREATED, Json(receipts)))
```

If item 3 of 5 fails, the first two POs are committed, items 4-5 never run, and the HTTP response is a 409 with NO receipts. The caller cannot tell which items succeeded without re-fetching. OpenAPI hints at this ("earlier successes persist") but the client has no structured access. Two clean options:
- Return a per-item response vector `Vec<BatchItemResult { rule_id, Ok(Receipt) | Err(code) }>` and always respond 201 (or 207) with the mixed payload; or
- Do a dry-run validation pass first (all items pass the use-case validation AND the RULE_NOT_FOUND precheck) before any writes, then the body loop really is all-or-nothing modulo concurrent tx races.

Given that the UI already knows which rule_id it sent, (a) is the lower-friction fix. Can punt to a follow-up task if scope matters — but at minimum add a TODO comment in the handler and an OpenAPI note pointing the client at the transactional bulk endpoint for atomic semantics.

### M3 — Bulk notification only fires for the FIRST rule, missing context for multi-rule bulk
File: `engine/crates/rf-application/src/procurement/create_reorder_po.rs:196-208`

```rust
let first_rule_id = &receipt.rule_ids[0];
if let Some(rule) = self.rule_port.get(first_rule_id).await? {
    self.notifications.send_reorder_po_created(&po, &rule).await
```

For a supplier-grouped bulk PO covering rules A+B+C, the notification carries rule A's material/reorder point — operators reading the email see "reorder triggered for Material A" and miss B and C. Either:
- Loop over `receipt.rule_ids` and send N notifications (duplicates the email but matches each rule's subscribers), or
- Extend `NotificationPort` with `send_reorder_po_created_bulk(&PurchaseOrder, &[ReorderRule])` that renders a combined payload, or
- At minimum, log the omitted rules so there's an audit trail.

Plan §"Auto-generated POs" doesn't pin this down. Worth a Gemini sign-off before we add an API surface; flagging as major because silent-per-rule loss degrades the "why did this PO appear?" signal for operators who monitor specific materials.

---

## Minor

### m1 — `generate_po_number()` burns a sequence value on RPC failure
File: migration line 106 inside the RPC.

`nextval()` is transaction-independent; if the INSERT or any downstream check fails, the sequence is already bumped and the next successful PO gets number N+1 with no hole filled. Acceptable for monotonic audit semantics (same as Stripe invoice numbers) but will produce visible gaps in the PO-YY-NNNN series. Document in the migration header or on `generate_po_number`. Do NOT defer the mint — the lock-and-mint-late pattern reintroduces the race the Task 1 sequence eliminated.

### m2 — RPC accepts empty `items` array and writes a PO with subtotal=0
File: migration lines 134-178.

`jsonb_array_elements('[]'::jsonb)` yields no rows, the FOR loop doesn't execute, and the header INSERT still lands with `items_count = 0`. The Rust use case rejects empty `items` (line 130) but a direct RPC caller (dashboards, psql, future Python scripts) bypasses that. Defense in depth: add early in the function,

```sql
IF jsonb_array_length(items) = 0 THEN
  RAISE EXCEPTION 'ITEMS_REQUIRED' USING ERRCODE = 'P0010';
END IF;
```

Reuse P0010 since there's no rule involved; or reserve P0013 alongside M1's suggestion.

### m3 — Negative `quantity_sqft` / `unit_cost` bypass Rust check via direct RPC
File: migration 154-155.

The Rust use-case validates `is_finite() && > 0`. A direct caller sending `-1.0` gets past the function and hits the `purchase_order_items.quantity_sqft > 0` CHECK, which rolls back cleanly. Good — but the error surfaces as generic `CHECK_VIOLATION` from the adapter, not a specific "negative quantity" hint. Since Rust is the only sanctioned caller today, cost of fixing this is higher than its value; note in the migration comment and move on.

### m4 — `input_rule_count := array_length(rule_ids, 1)` after the null check
File: migration line 86.

The null guard at line 62-64 is fine; after that point `array_length` is non-null. Still, tiny readability win to move line 86 up beside the COUNT at line 77 so the comparison on 87 reads directly without hunting for where `input_rule_count` was set.

### m5 — `extract_parens_suffix` is verbatim duplicated in `receive.rs` and `create_reorder_po.rs`
Files: `engine/crates/rf-supabase/src/receive.rs` and `engine/crates/rf-supabase/src/create_reorder_po.rs:128-135`.

Both implementations are byte-identical. Move to `rf-supabase::postgrest` (next to `PostgrestError`) as `pub(crate) fn extract_parens_suffix(...)`. Low risk, mechanical. If you prefer shipping before refactoring, leave a TODO on one copy pointing at the other so the next touch consolidates.

### m6 — Row handler clones `rule_id` for both `rule_ids` and `items[0].rule_id`
File: `engine/crates/rf-api/src/procurement/create_reorder_po.rs:104-110`

Two `String` clones per request. Fine functionally, but `ReorderRuleId` wraps a `String` and holds it twice; worth a single clone stored in a local (`let rule_id = ReorderRuleId(rule_id); let items = vec![ReorderPoItem { rule_id: rule_id.clone(), ... }]; let rule_ids = vec![rule_id];`). Micro-nit.

### m7 — `supplier_id.0.trim().is_empty()` inconsistent with other wrapper checks
File: `engine/crates/rf-application/src/procurement/create_reorder_po.rs:135-143`

The use case trims before emptiness checks on `supplier_id` and `item.rule_id`; but the DTO newtypes (`SupplierId`, `ReorderRuleId`) treat whitespace-only strings as valid on construction. Fine here (we're at the boundary) but the pattern is inconsistent with how other use cases enforce — several in this crate don't trim. Low priority: pick a single policy in the domain types and propagate.

---

## Nits

- `engine/crates/rf-application/src/procurement/create_reorder_po.rs:128`: `"rule_ids must include at least one rule"` vs line 131 `"items must include at least one line"`. Phrase-level inconsistency with other use cases' `"field X is required"` idiom.
- Migration comment at 36-40 is great context. One trailing "the full auto-reorder design" could benefit from a link to the follow-up task reference (S3d ticket) if we have one.
- `ReorderPoMode::IndividualBatch` is only used as a flag to label the invocation; the use case treats it identically to `Row`. Consider either dropping the variant and having the batch handler pass `Row` (fewer moving parts) or using it to gate the row-mode length-1 strictness (so "batch of one" is distinguishable from "row request"). Current state works but is vestigial.

---

## Verified fine

- **FOR UPDATE deterministic ordering.** `ORDER BY id` inside the subquery guarantees two concurrent callers lock overlapping ids in the same order; no deadlock pair on overlapping sets.
- **SQLSTATE collision.** Receive uses P0001-P0004, reorder uses P0010-P0012 — disjoint, and no other function in the migrations grep-hits for these codes.
- **SECURITY INVOKER default.** No `SECURITY DEFINER` on the function; RLS and `created_by = user_id::TEXT` land under the JWT's identity.
- **Route ordering.** `/reorder-rules/suggestions`, `/create-pos`, `/create-bulk-po` registered at router.rs lines 156-166 before `/reorder-rules/{id}` at 173 and `/reorder-rules/{id}/create-po` at 179. Axum 0.7 matcher prefers static segments over captures, so `/create-pos` won't be captured as id="create-pos". Matches the same pattern that rolls/stats uses.
- **Use-case validation matrix.** Row (1 rule, 1 item, ids match), Bulk (items subset of rule_ids), empty-items reject, negative qty reject — all covered by tests 469-594.
- **Notification fire-and-forget.** Error is logged with `po_id` + `po_number` + `error`, the receipt still returns — matches the "PO already persisted, don't roll back on notify failure" spec.
- **`bulk` flag + single rule.** Bulk-of-one stamps `reorder_rule_id = rule_ids[1]` (line 124-126 CASE). Correct: a one-rule bulk IS a row-equivalent PO from the UI's perspective.
- **Defensive check at line 145-151.** The "item rule_id not in rule_ids" path is a belt-and-suspenders catch for a misbehaving caller bypassing Rust validation; good to have.
- **Adapter error mapping.** 23505/23503/23514 precede P0010-P0012 in the match, so a CHECK violation with a pg_code of 23514 overrides a RAISE message that says `RULE_INACTIVE` — verified by test `check_violation_takes_precedence_over_message`.
- **Body size.** `1024 * 1024` (1 MB) matches the rest of `rf-api`; no per-endpoint drift.
- **`legacy auto_create_purchase_order` retention.** Migration header explicitly documents why it stays (active caller: `daily_reorder_check` from `20240219000011`). `pg_cron` is NOT scheduled anywhere in the migrations grep — the helper sits inert until S3d revisits auto-reorder. Not dropping is correct.

---

## Recommendation

Ship after M1 (duplicate rule_ids policy — pick reject-with-clear-code, add a use-case test) and an OpenAPI doc clarification on M2 (batch partial failure). M3 deserves a short spec conversation before landing but isn't a blocker for the commit; leave a `// TODO(s3d): bulk notification loop` and a Gemini question.
