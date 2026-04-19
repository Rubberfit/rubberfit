# Task 5 plan sign-off — Codex

You wrote the second-opinion report at `.claude/research/task5/codex-report.md`. Claude synthesized your concerns into the execution plan at:

**`docs/superpowers/plans/2026-04-18-s2.5-task5-separator.md`**

Review it. No code changes. No implementation.

## Specific concerns you raised — verify they're addressed

1. **Layout-key churn** — Claude decided to wrap `Layout` (not `BPProblem`), which sidesteps BPProblem's `SlotMap<LayKey, Layout>` / `BPLayoutType::Open|Closed` complexity. Your original concern was that layout keys churn on `restore()`. Confirm: does wrapping just `Layout` avoid the problem cleanly, or does it smuggle the problem into Task 8's wiring instead?

2. **Algorithm 10 semantics with Vec<SeparatorWorker>** — the plan keeps workers plural and runs them sequentially. Is that faithful to Algorithm 10? In particular: each worker starts from the same master state, different RNG shuffle orders, pick min-weighted-loss. Claude's `move_items_multi` in §2.2 does this. Good enough?

3. **Weighted vs unweighted loss** — §2.2 Separator::separate uses unweighted loss for improvement and success, weighted loss is not mentioned in the separate() method but is implicitly used in `move_items_multi` min-by-key. Is the split correct?

4. **Weight retention** — §2.2 `rollback` branches on `Some(_)` → `restore_but_keep_weights`, `None` → `CollisionTracker::new`. Does that match upstream?

5. **Sparrow paper defaults** — §2.1 `SeparatorConfig` defaults claim `strike_limit=3, iter_no_imprv_limit=200`. Verify against sparrow `src/config.rs`.

6. **`search_placement(..., Some(pk), ...)`** — worker's `move_items` must pass `Some(pk)`. §2.2 SeparatorWorker::move_items says "search_placement(&self.layout, item, Some(pk), ...)". Good.

7. **RNG determinism** — workers seeded via `Xoshiro256PlusPlus::seed_from_u64(rng.random())` in constructor order. Matches upstream?

8. **`move_item` — BPP placement signature** — since we operate on `Layout` directly (not BPProblem), the `BPPlacement` / `BPLayoutType::{Open,Closed}` issue disappears entirely (we call `layout.remove_item(pk) -> PlacedItem` and `layout.place_item(item, d_transf) -> PItemKey`). Confirm this is what you expect.

## Output

Write (have Claude save) a report at `.claude/research/task5/codex-signoff.md` with:

1. Verdict: APPROVE / APPROVE WITH CHANGES / REJECT.
2. For each of 1-8 above, your confirmation or concern.
3. New concerns not in your original report but surfaced by the synthesis.

Under 600 words. Terse, concrete, with line refs to upstream sparrow or jagua-rs.

If the Codex sandbox is read-only, print the full report text so Claude can save it.
