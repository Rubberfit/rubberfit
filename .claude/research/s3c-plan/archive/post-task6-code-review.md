# S3c Task 6 — Post-implementation code review

Scope: ReorderRule CRUD + `GenerateReorderSuggestionsUseCase` + PostgREST adapters + `/suggestions` handler. Compared against the TS source (`reorderCalculations.ts`, `generate-reorder-suggestions.use-case.ts`, `IReorderService`) and the plan contract.

Verdict: **ship-ready with one major parity break and two small fixes**. Full CRUD contract + pending suppression + supplier resolution + urgency normalization all behave correctly and match TS semantics. The EOQ-backed quantity floor from the TS use-case is not ported — that needs a decision before T11b UI integration.

---

## Critical
*(None — no security / data-loss / crash issues found.)*

---

## Major

### M1 — EOQ-backed quantity floor missing — parity break with TS calc
`engine/crates/rf-application/src/procurement/suggestions.rs:287-296`

TS (`generate-reorder-suggestions.use-case.ts:91-102`) computes `baseQuantity = Math.max(rule.reorder_quantity, optimal.quantity)` via `calculateOptimalOrderQuantity` (EOQ — annual demand × ordering cost / holding cost). The Rust port only uses `rule.reorder_quantity` as the base. This is a **real semantic divergence**: when a rule's `reorder_quantity` is low but daily usage is high, the TS suggests a larger order; Rust suggests the rule-configured quantity unchanged.

Two options:
1. **Port EOQ as a pure function** on the use case (no new port dependency — `average_daily_usage_sqft` already gives annual demand; `cost_per_sqft` already resolves). 15-20 lines; fits the current shape cleanly.
2. **Explicitly drop EOQ from the contract** — document the decision in the plan and in `suggestions.rs` module docs. User-facing effect: smaller PO suggestions than the TS UI shows today.

Either is defensible; silently shipping option 2 without the doc is not. Given Codex's sign-off was about "preserving the full suggestion contract," I'd lean toward porting it (option 1) unless the plan explicitly says otherwise. Flag for Task 11b regardless — the TS UI may rely on the bumped quantity for "days of supply" displays.

### M2 — `days_until_stockout` shape diverges from TS (Option vs. 0)
`suggestions.rs:220-226`, DTO at `engine/crates/rf-api/src/procurement/reorder_rules.rs:164-165`

TS returns `0` when `avgDailyUsage === 0`. Rust returns `None`, and the DTO elides the key with `skip_serializing_if`. The generated TS types change `daysUntilStockout: number` → `daysUntilStockout?: number`. The TS UI at `app/dashboard/...` almost certainly assumes a number (sortable, formattable, comparable to thresholds).

The comment on the function says "UI renders '—' for that case" but no UI code does that today — the TS UI gets `0`. Two-line fix if we want TS parity: return `Some(0)` instead of `None` when `avg_daily <= 0.0`; drop the `skip_serializing_if`; keep the field non-optional on the DTO. Alternatively, document explicitly that Task 11b must handle the missing key.

Plan language ("`None` when avg daily usage is zero") supports the current Rust behavior, but the plan post-dates the TS code — if TS behavior is the reference, this needs a follow-up.

---

## Minor

### m1 — `in_list` builds a raw CSV — unsafe if material IDs ever hold commas/parens
`engine/crates/rf-supabase/src/suggestions.rs:78-88`

Current implementation joins with `,` and wraps in `in.(...)`. Material UUIDs are safe today, but the comment "we delegate sanitisation to the caller" is load-bearing — future non-UUID IDs would break filtering or allow injection into the PostgREST filter. Two mitigations (pick one):

- Tighten the comment to state "UUID-only" and have `MaterialTypeId`'s newtype constructor reject non-hex. (Defence-in-depth.)
- URL-encode each entry and wrap with `"..."` (PostgREST supports `in.("a","b")`).

Not a security issue today because IDs come from DB-validated newtypes, but the comment should promise what the caller actually enforces.

### m2 — Embedded-resource filter syntax should be verified against Supabase
`engine/crates/rf-supabase/src/suggestions.rs:158-166`

The filter `purchase_order.status=neq.draft` with embed alias `purchase_order:purchase_orders!inner(status)` is the documented PostgREST pattern (the alias becomes the filter prefix), so it should work — but I'd still want a live hit against the Supabase instance before T11b. Two failure modes to check:

- PostgREST <12 ignores the embedded filter silently and returns everything (no error, just wrong math).
- Some versions expect the filter to use the real table name (`purchase_orders.status=neq.draft`) rather than the alias.

Adding a cargo integration test (or a one-shot `curl` against the dev env) would pin this down. This is the single highest-risk piece of the whole task — if the filter silently no-ops, pending suppression breaks AND the stock+pending trigger check becomes meaningless.

### m3 — `average_daily_usage_sqft` streams the full 90-day cuts table client-side
`engine/crates/rf-supabase/src/suggestions.rs:123-139`

Sums `total_sqft_used` in Rust by pulling every row. Fine at today's volumes; at 10k+ cuts per 90 days it bloats the response. PostgREST supports `select=total_sqft_used.sum()` via RPC or the newer aggregate functions. Flag for S4 performance pass — not a blocker.

### m4 — `generateReorderReason` dropped silently
`reorderCalculations.ts:330-343`, TS `ReorderSuggestion.reason` field

TS populates a human-readable `reason` string ("Out of stock — immediate reorder required", etc.). The Rust `ReorderSuggestion` domain type doesn't have the field (I didn't see it in the DTO either). The TS `createAutomaticPurchaseOrder` uses `suggestion.reason` as the PO note (`reorderCalculations.ts:183`). Task 7 (reorder→PO) will need either a ported reason generator or a different note source. Not a Task 6 bug, but flag for Task 7 handoff.

### m5 — `touch_triggered_at` silently accepts unknown IDs
`engine/crates/rf-supabase/src/reorder_rules.rs:187-207` and fake at `reorder_rules.rs:324-336`

PATCHing a non-existent id returns an empty `Vec<ReorderRule>` and `touch_triggered_at` returns `Ok(())`. For the Task 7 call site this is probably fine (create-PO already validated the rule id), but a silent no-op is surprising from a port method. Consider returning `Err(AppError::NotFound)` if the PATCH affects 0 rows — or at minimum a debug log.

### m6 — `UpdateReorderRuleBody` can't clear `supplier_id` / `max_stock_level` / `safety_stock_days` / `notes`
`engine/crates/rf-api/src/procurement/reorder_rules.rs:134-153`

The handler acknowledges this in the comment. Consumers today probably don't need it, but the TS `UpdateReorderRule` type does allow nulling. When the UI lands in T11b with a supplier picker that has a "Clear supplier" option, this will surface. Flag for T11b; no code change required today.

---

## Nits

- `reorder_rules.rs:22` doc mentions `DUPLICATE_PAIR` but the code emits `DUPLICATE_MATERIAL_RULE` (`reorder_rules.rs:229`). One-line doc fix.
- `suggestions.rs:143` match arm `"normal" | "medium"` — the `"medium"` branch is dead (producer `determine_urgency` never emits `"medium"`). Either delete for clarity or add a comment that this is a safety net for future renaming.
- `suggestions.rs` test at line 363: `determine_urgency(125.0, 500.0)` is expected `"high"` (ratio = 0.25, boundary ≤). TS matches (`stockRatio <= 0.25`). Good — the comment `// 0.25` makes the boundary explicit.
- `reorder_rules.rs:164-177`: the "catch DB CHECK early" validation comment is good. Consider mentioning the exact CHECK constraint name.
- Tests in `suggestions.rs` reuse the same `rule_with_supplier` helper across 4 tests — tight and clean. Nice.

---

## Verified fine

- Urgency ladder parity with TS (critical/high/normal/low; `normal→medium` normalization at the use-case boundary).
- `suggested_quantity`: base → 1.5× bump at ≤25% → max_stock cap → round-10. Matches `calculateSuggestedQuantity` exactly.
- `cost_per_sqft` resolver: resolved-supplier quote → preferred quote → first quote → material default → $10 sentinel. Strict superset of TS (`estimateReorderCost`).
- Supplier resolution precedence: rule.supplier_id → preferred-active → first-active → None. The "rule-pinned supplier not in quotes list" fallthrough to `supplier_name(id)` is correct behavior IMO — UI should show the pinned supplier's name even if the material-supplier link was torn down.
- Pending-PO suppression: `has_pending && !include_pending` short-circuit runs BEFORE the `current + pending > reorder_point` check and BEFORE `suggested_quantity`. Rule with stock=0 + pending=anything correctly doesn't show unless `include_pending=true`.
- Route ordering: `/reorder-rules/suggestions` registered at `router.rs:155` before `/reorder-rules/{id}` at `router.rs:164`. Axum matches static segments first, so this is belt-and-suspenders — still good to be explicit.
- Validation: `reorder_quantity > 0`, `max >= reorder_quantity`, `max > reorder_point`, blank material_type_id rejected. DB CHECK errors also mapped via `CHECK_VIOLATION` fallback (`reorder_rules.rs:231`).
- `DUPLICATE_MATERIAL_RULE` distinct conflict code — correct granularity for UI treatment.
- `current_stock_sqft = Σ width × remaining_length / 144` consistent with S3b stats formula.
- `active:true` filter on `material_suppliers` in the quote query — correct; matches TS `.eq("active", true)`.
- SET-NULL supplier FK handled: bare `supplier:suppliers(*)` embed (no `!inner`) lets deleted-supplier rules still surface. Plan requirement met.
- Test coverage: 24 tests, covers all the important branches.

---

## Missing test coverage (suggest adding)

- `reorder_rules` adapter: no direct unit tests for `map_write_error` code mapping. A small test that round-trips a `PostgrestError { pg_code: Some("23505") }` through the mapper would lock in the `DUPLICATE_MATERIAL_RULE` contract.
- `suggestions` use case: no test that exercises the **supplier-name-fallback path** (rule pins an id that isn't in quotes → `supplier_name(id)` read). The `FakeReads::supplier_name` stub always returns `None`, and no test inspects the call.
- `suggestions` use case: no test for `current_stock + pending_quantity > reorder_point` when `include_pending=true` — the code path exists but isn't covered.
- `suggestions` use case: no test for the "`suggested - pending <= 0` drop" path. Easy to add and matches the TS contract.

Total findings: 2 major, 6 minor, 4 nits. Nothing that blocks the Task 6 commit except M1 — that one needs a decision (port EOQ vs. document the drop) before T11b, not necessarily before the commit itself.
