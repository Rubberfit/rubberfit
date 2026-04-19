# Task 6 plan sign-off — Gemini

**Verdict: APPROVE WITH CHANGES** (two small required fixes in §3, tests).

Plan reviewed: `docs/superpowers/plans/2026-04-18-s2.5-task6-explore.md`.
Original design: `.claude/research/task6/gemini-report.md`.

---

## Divergence verdicts (§2 of the plan)

### 1. Early-exit on first feasibility — AGREE (Codex wins)

My original argument was pool diversity for Task 7/12. Re-reading the parent plan: Task 7 compress takes **one** layout; Task 12 cross-bin swap isn't designed yet. Building a diversity mechanism for a consumer that doesn't exist is YAGNI. If Task 12 later wants diverse starts, reopening this is a ~10-LOC change (flip early-return to pool-push). The `Feasible(LayoutSnapshot)` single-variant return is the right shape today.

### 2. Restore `Separator::move_item` — AGREE (Codex wins)

My "inline 3 lines × 4 sites" reasoning was premature optimization for a leaner separator surface. 12 duplicated lines across `disrupt_solution` + `relocate_contained` is clearly worse than one pub method. Task 5 sign-off explicitly pre-authorized the reintroduction. Plan §3.4 restoration is correct. Confirm the deviation block update in `separator.rs` lands in step 1c.

### 3. Fresh tracker on pool restart (`rollback(snap, None)`) — AGREE (Codex wins, important)

This one matters. My original carried `CTSnapshot` and used `restore_but_keep_weights` on the rationale that "we don't shrink, so preserving is cheap." Codex is right that this is a **semantic** deviation, not a cheapness question: sparrow's GLS relies on weight-discarding escapes to avoid getting trapped in the same basin. Preserving weights across a pool restart defeats the escape. Upstream L79 uses `None` — faithful port wins. Pool tuple correctly collapses to `Vec<(LayoutSnapshot, f32)>`. Good catch.

### 4. Layout-scoped large-item cutoff — AGREE (Codex's catch, critical)

I missed this. My report said "total convex hull area from `sep.instance.items` × qty" — which is correct for SPP (single strip = single layout) but wrong for BPP where `instance.items` aggregates demand across all bins. Computing a cutoff against phantom items not present in `sep.layout` would produce garbage thresholds. Plan §3.3 correctly uses `sep.layout.placed_items.values()` and looks up areas via `sep.instance.item(pi.item_id).shape_cd.surrogate().convex_hull_area`. This is the right fix. The commit message §7 correctly flags it as a BPP deviation.

### 5. `rand_distr` version `0.6` — AGREE

My original said `0.5` for rand-0.10 compatibility. Codex/Claude verified `Cargo.lock` already has `rand_distr 0.6.0` via jagua-rs transitive. Direct-adding `0.6` introduces no new crate to the graph and matches what's already linked. Correct.

---

## Required changes

### R1 — §3.2 loop: pool cap check is wrong

Plan L107:
```
if pool.len() >= config.max_conseq_failed_attempts.unwrap_or(usize::MAX) { break; }
```

Upstream sparrow (explore.rs L60-63) increments a **consecutive-failures counter** that resets on any feasibility. Here, because we early-exit on feasibility, `pool.len()` and the counter are equivalent **only for the current call**. That's accidentally correct, but the name `max_conseq_failed_attempts` now means "max pool size" — misleading. Either:

- (a) rename the local tracking (keep field name, add a comment: "with early-exit, pool.len() == consecutive failures trivially"), **or**
- (b) use an explicit `let mut conseq_failed = 0; conseq_failed += 1; if conseq_failed >= cap { break; }` — keeps parity if someone later removes early-exit.

Prefer (b) — one extra line, zero ambiguity. Add to §3.2 pseudocode.

### R2 — Test 3 assertion `snapshot.placed_items.len() == 2`

Plan L347. After disrupt + rollback churn, `placed_items.len()` is stable across iterations (disrupt is swap+relocate, not remove), so this passes. But the assertion is tautological — asserts the bin has the items we placed. Real signal should be `total_loss > 0.0` (already present, good) plus a shape assertion on the best-infeasible snapshot (e.g., both items' `d_transf` are within the bin bounds). Weak test, but not wrong. Keep as-is if tight on time; strengthen if touching test file anyway.

---

## Nice-to-haves (optional)

- **§3.3** — consider asserting `ch_area_cutoff > 0.0` after the accumulation loop. If `placed_items` is length ≥ 2 (guard above) and all items have nonzero area (invariant), cutoff is nonzero, but an explicit `debug_assert!` documents the invariant.

- **§3.5 listener extension** — the three-method trait (`report_improving` / `report_feasible` / `report_infeasible`) mirrors sparrow's `ReportType::{ExplImproving, ExplFeas, ExplInfeas}` but sparrow also emits `CmprImproving` for compress. Task 7 will want a fourth. Either add `report_compress_improving` now with a default noop (cheap future-proofing), or leave it for Task 7 (fine). Default-noop additions don't break `NoopListener`, so adding later is a no-op.

- **§3.6 `BasicTerminator` location** — `search/terminator.rs` (not `gls/`) is correct; terminators are cross-phase (explore + compress + orchestrator). Agree with the move.

- **§5 sequence** — 1a→1d as prerequisites before §2 skeleton is right. TDD-order-preserving.

---

## Verdict summary

Plan correctly resolves all 5 divergences in favor of the stronger argument (4 Codex wins + 1 mutual agreement on `rand_distr`). Type signatures match the jagua-rs 0.7.1 surface. Deviations are documented. Commit message §7 accurately reflects scope.

**Two required fixes (R1, R2)** before implementation starts. Both are low-risk edits to the plan text, not scope changes.

After those edits: APPROVE unconditionally. Ship it.
