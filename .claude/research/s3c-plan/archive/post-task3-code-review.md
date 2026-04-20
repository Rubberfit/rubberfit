# S3c Task 3 — Post-implementation Code Review

**Scope**: status-transition use case, `AppError::ConflictWithDetails`, HTTP handler, Supabase `update_status`, notifications adapter, `ProcurementPortFactory::notifications`.
**Baseline**: `23e4df2` (Tasks 1+2 committed).
**Verdict**: merge-able after the **major** below is addressed; minors + nits are safe to ship as follow-up.

---

## Critical
None.

## Major

### M1. `received` accepted by `parse_status` bypasses authN-free input surface — false alarm, confirmed fine
The handler intentionally parses `received` as a valid enum variant so the use case can emit `ConflictWithDetails { allowedTargets }` instead of a flat 400 (`engine/crates/rf-api/src/procurement/status.rs:46-47`). This matches the plan and Reviewer M1 — CREATE and UPDATE both reject with code `RECEIVED_REQUIRES_RECEIVE_FLOW`. **Verified consistent** with `purchase_orders.rs:232-236` (CREATE, flat `Conflict`) and `purchase_orders.rs:303-307` (UPDATE, `ConflictWithDetails`). One asymmetry worth a note: CREATE returns `Conflict` (no details), UPDATE returns `ConflictWithDetails` (with `allowedTargets`). That's fine — on CREATE there's no "from" state to derive a list from — but the **review-level** issue is that the two share a code. Consumers that switch on `code` alone can't tell which path rejected them, and the CREATE body has no `details.allowedTargets`. Either accept that divergence (and document it in the OpenAPI `description` for POST `/po`) or emit `ConflictWithDetails("RECEIVED_REQUIRES_RECEIVE_FLOW", json!({ "allowedTargets": [] }))` from CREATE for shape consistency. **Recommend the latter** — one-line change, same JSON shape on the client.

### M2. `update_status` adapter clobbers `order_date` on every `Ordered` re-transition
`engine/crates/rf-supabase/src/purchase_orders.rs:298-305` has the comment "Stamp order_date only if not already set — a re-transition through `ordered` shouldn't silently rewrite the stamped date." The **code does the opposite**: it unconditionally writes `today_iso_date()`. The use case forbids `Ordered → Ordered` (no-op shortcut) but `Cancelled → Draft → Pending → Approved → Ordered` is legal and stamps a new `order_date`, wiping the original. Either:
- Fix the code to match the comment (read current, branch on `Option`), or
- Delete the comment — client-clock re-stamp is defensible for this column and the domain test suite does not assert non-rewrite.

Pick one; the current state is a correctness landmine because the comment documents an invariant the code doesn't uphold.

## Minor

### m1. Notification failures are silently swallowed with no logging
`engine/crates/rf-application/src/procurement/purchase_orders.rs:379` uses `let _ = self.notifications.send_po_approved(&updated).await;`. The comment says "the adapter logs from its own HTTP-layer middleware" but the adapter returns `AppError::infrastructure(...)` and nothing wraps it before it's dropped. In production a down `notification_queue` INSERT means the user sees a "PO approved" success and operations never finds out the email queue is broken. **Fix**: at minimum `tracing::warn!(?err, po_id=%updated.id.0, "po_approved notification failed")` before the drop. Zero-cost, no behavior change.

### m2. `SupabaseNotificationRepository` is not test-covered
Unlike `SupabasePurchaseOrderRepository` (has adapter-level tests in `rf-supabase`), the new notifications adapter ships without a single test. The two-table write pattern + static `"system_alert"` constant + the `user_identifier = "procurement-watchers"` sentinel are all load-bearing behaviors that will silently rot. **Recommend**: one mocked-transport test per `send_*` method asserting the outgoing JSON bodies.

### m3. `approved_at` from Rust client clock vs Postgres `now()`
`engine/crates/rf-supabase/src/purchase_orders.rs:361-363` stamps via `chrono::Utc::now()`. The comment acknowledges the tradeoff. Acceptable for display, but two risks: (1) clock skew across the app container fleet shows up as audit-trail jitter, (2) if the Rust container clock is >30s off, the `jwt_middleware` leeway (30s) could accept a JWT whose `approved_at` timestamp predates its issue time. Low probability; **flag only**, no action required unless SRE pushes back.

### m4. `validate_transition` allocates `Vec<&str>` twice on the error path
`purchase_orders.rs:298-302` builds `allowed: Vec<&str>` before the branch decision. On the `INVALID_STATE_TRANSITION` path the vec is consumed directly; on the `RECEIVED_REQUIRES_RECEIVE_FLOW` path the `from.allowed_targets_from()` result is re-read via `contains(&to)` on line 309 unnecessarily (we know `to == Received` and `Received` isn't in any `allowed_targets_from` set by the domain invariant, so the second branch is dead for that input). Minor efficiency nit; readability is fine as written.

### m5. `user_identifier = "procurement-watchers"` is a string literal buried in the adapter
`engine/crates/rf-supabase/src/notifications.rs:94`. It's documented ("the sentinel the TS service already writes") but it's not a `const` and there's no grep-able cross-reference. Future refactor risk. **Recommend**: `const PROCUREMENT_WATCHERS: &str = "procurement-watchers";` at module top.

## Nits

### n1. Fake-clock bleed in tests
`engine/crates/rf-application/src/procurement/purchase_orders.rs:518` and `:521` hard-code `"2026-04-19T12:00:00Z"` / `"2026-04-19"`. Fine for now but tests will look weird in 2027. Consider a tiny clock port if this pattern repeats in Task 4+.

### n2. `UpdatePurchaseOrderStatusBody.status: String` — bikeshed
The body takes a free-form string then parses. An alternative: `#[serde(deserialize_with = "...")]` into `PurchaseOrderStatus` directly, with serde error → 400. Trade-off: current code yields a nicer error message (`"unknown status 'foo'"`) than serde's default. Keep as-is.

### n3. Response body size limit
`status.rs:85` caps the body at `1024 * 1024`. For a 1-field JSON object this is 16 orders of magnitude beyond reality. Match the existing handler convention or tighten to e.g. 4 KB. Inconsistency only, not a security issue.

### n4. Dead `static` match arm
`purchase_orders.rs:315-324` (`PurchaseOrderStatus::Received => return Err(...)`) is unreachable because the use case validates first. Adapter-layer belt-and-braces is fine and matches the comment, but the code path is test-unreachable without reflection. Accept.

### n5. No `unwrap()` or `as` casts at new boundaries — verified clean.

---

## Verified fine

- **State machine source of truth**: `validate_transition` defers to `from.allowed_targets_from()`; domain tests (`engine/crates/rf-domain/src/procurement.rs:264-274`) lock the set in.
- **`RECEIVED_REQUIRES_RECEIVE_FLOW` code parity** between CREATE and UPDATE (subject to M1 shape divergence above).
- **Approve-notification exactly-once**: `approve_fires_notification_exactly_once` covers it; `status_no_op_is_idempotent` proves no-ops don't fire.
- **Side-column stamping**: `Approved` sets `approved_by`+`approved_at`; `Ordered` sets `order_date`; `Draft/Pending/Cancelled` clear `approved_by`+`approved_at` (satisfies `valid_approval` CHECK).
- **Adapter defense-in-depth on `Received`**: `purchase_orders.rs:315-324` returns `Conflict("RECEIVED_REQUIRES_RECEIVE_FLOW")`.
- **Notifications table CHECK compliance**: `system_alert` is the only PO-friendly value in the `notifications` CHECK (`20240217000004_create_notifications_table.sql:5`); `notification_queue` CHECK includes all three types used (`po_approved`, `delivery_received`, `po_created`).
- **No service-role usage**: `auth.rs:213-223` builds a per-request `PostgrestClient` from `auth.raw_jwt` — RLS enforced.
- **Layer cleanliness**: `chrono` confined to `rf-supabase` (Cargo.toml:20-24, `default-features = false`, `features = ["clock"]` only); `serde_json` on `rf-application` justified by `ConflictWithDetails` payload; no HTTP/PostgREST leakage into `rf-application`.
- **HTTP actor threading**: `status.rs:83` copies `auth.claims.sub` to `actor`, passes to use case, reaches `update_status(..., approved_by)` — approved_by trace intact.
- **`ConflictWithDetails` wiring**: `cuts.rs:253-263` emits `{code, details}` with `StatusCode::CONFLICT`; body shape matches the handler's OpenAPI description.
- **Idempotency**: same-status short-circuit at `purchase_orders.rs:355-357` returns the current row and skips both the port write and the notification fire.
- **Test coverage for the known edge cases**: Approved→Draft (clears approved fields — covered implicitly by the adapter branch + use case happy-path through `Pending→Draft`), Cancelled→Draft (domain test asserts the loopback), terminal Received→* (`terminal_received_blocks_all_further_transitions`), notification-failure-not-rollback (`approve_fires_notification_exactly_once` + the use-case's `let _ = ...` drop). One real gap: **no test asserts that `Approved → Draft` clears `approved_by`/`approved_at` in the adapter** — the use case covers the transition but the fake port's clear-on-back-transition logic is not exercised by a test.
- **Concurrency**: two-step get-then-patch is fine for this API (no compensating mutation cost if a concurrent write wins); the `valid_approval` CHECK is the real safety net. A `FOR UPDATE` lock would require an RPC and is out of scope.

---

## Recommended fix order

1. **M2** (2-line fix or comment deletion) — before merge.
2. **M1** (one-line shape normalization) — before merge if the TS client already branches on `details`.
3. **m1** (add `tracing::warn!`) — before merge; it's a 1-liner and unlocks ops visibility.
4. **m2** (adapter tests) — follow-up PR.
5. Everything else — follow-up or drop.
