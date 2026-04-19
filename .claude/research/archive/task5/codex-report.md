# Codex Task 5 Second Opinion (saved by Claude; Codex sandbox was read-only)

## Confirmed Findings

**Single-layout assumption is the biggest non-mechanical gap.** Sparrow's Separator/worker read one mutable `Layout` directly for tracker init, saves/restores, candidate enumeration, evaluator construction, and item moves; BPP has `BPProblem.layouts: SlotMap<LayKey, Layout>` and no `layout` field. A direct `SPProblem -> BPProblem` rename will not compile, and an ad hoc "pick any layout" port will be wrong as soon as the active layout key changes. The already-ported REMA pieces below Separator are layout-scoped, so the safe BPP equivalent is a bin-scoped wrapper carrying an active `LayKey`, not teaching tracker/sampler/evaluator about whole-problem state.

**Key churn is mandatory, not incidental.** Sparrow removes then re-places items and returns a new `PItemKey`; `explore.rs` immediately rebinds `pk1/pk2` after swaps for that reason. In BPP this is worse: `remove_item` may close the layout and `place_item` returns both a possibly-new `LayKey` and a new `PItemKey`. If Claude keeps keys stable, `CollisionTracker::pk_idx_map` and post-swap follow-up moves will silently target dead keys. REMA's tracker already supports `register_item_move(old_pk, new_pk)`; the missing part is active-layout-key handling in the unported separator shell.

**Neighbor selection is weighted, but success/improvement is unweighted.** `move_items_multi()` keeps the worker with minimum `get_total_weighted_loss()`, while `separate()` declares success and updates the incumbent using raw `get_total_loss()`, then updates GLS weights after every nonterminal iteration. Using one metric everywhere changes the search. REMA already has both weighted and unweighted tracker APIs, so this is handled below Separator.

**Weight retention across rollback is a real invariant.** `rollback(Some(snapshot))` restores losses/keys but deliberately keeps weights; `rollback(None)` rebuilds the tracker from the layout. Separator uses the former between strikes, while explore uses the latter before disruption. Resetting weights on every rollback will neuter GLS. REMA already ported `restore_but_keep_weights`.

**`search_placement(..., Some(pk), ...)` is part of separator semantics.** Worker logic relies on the current placement being inserted as an initial candidate and on focused sampling around the current bbox; that is why `best_sample.expect(...)` is safe. Dropping `Some(pk)` or the focused sampler can turn "best sample always exists" into a panic/regression. REMA already preserved this.

**`change_strip_width` is SPP-only and should not be mechanically ported.** It shifts items right of a split line, mutates strip width, then rebuilds the tracker and all workers; explore/compress depend on repeated width shrinkage to drive the strip objective. BPP has fixed bins, so Task 5 should delete or explicitly wall off this API rather than retype it. Current REMA has no separator/explore/compress module yet.

**Algorithm 10 semantics matter even in a single-thread port.** Every worker iteration starts from the same master solution/tracker, explores a different random item order, and all but the best neighbor are discarded. A single-thread port should keep `Vec<SeparatorWorker>` and run it sequentially; collapsing to one worker or letting worker 2 continue from worker 1's mutated state changes the algorithm, not just performance. REMA currently has no `rayon` dependency, but nothing prevents sequential workers.

**Confirmed missing:** `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` does not exist. `gls/mod.rs` exports only helper modules and `search::optimize()` is still a passthrough, so none of the separator-specific semantics or the planned `SeparateOutcome` shape exist yet.

## API And Borrow Traps

**Confirmed API mismatch.** `BPProblem::place_item()` requires `BPPlacement { layout_id: BPLayoutType, item_id, d_transf }` and returns `(LayKey, PItemKey)`; `remove_item()` requires both keys and may return `BPLayoutType::Closed { bin_id }` if the layout emptied. There is no direct BPP equivalent of Sparrow's `SPProblem::place_item(SPPlacement) -> PItemKey` / `remove_item(PItemKey) -> SPPlacement`.

**Hypothesis:** Sparrow's `iter_mut().min_by_key(...).map(|opt| (opt.prob.save(), &opt.ct))` is where the BPP port will start fighting the borrow checker once `active_lkey` updates are introduced. Refactor to `iter()` and clone both `BPSolution` and `CollisionTracker` inside a short scope, then mutate `self.prob/self.ct/self.active_lkey` after that borrow ends.

**Hypothesis:** implement BPP `move_item` by taking the `BPPlacement` returned from `remove_item()`, mutating only `d_transf`, and feeding it back to `place_item()`. That naturally handles the `Open(lkey)` vs `Closed { bin_id }` branch and avoids holding a borrow of `self.prob.layouts[lkey]` across mutation.

**Hypothesis:** cache `active_bin_id` separately from `active_lkey`. `BPProblem::restore()` can remove and recreate layouts and reports that via its `bool` return, so a saved `LayKey` alone is not stable across rollback.

## Determinism, Defaults, Budget

**Confirmed:** Task 5 can stay deterministic single-threaded if it preserves Sparrow's seed derivation order: top-level seeded xoshiro, worker RNGs seeded from `rng.random()` in constructor order, then fixed-seed worker execution on cloned master state. REMA's RNG helper already locks in seeded streams; losing determinism would come from changing draw order, not from removing rayon.

**Confirmed:** The Sparrow defaults that matter here are exploration `(strike_limit=3, iter_no_imprv_limit=200)` and compression `(5,100)`. REMA `gls/consts.rs` already matches Sparrow's GLS weight constants `2.0 / 1.2 / 0.95`, but it has no separator defaults/config at all, and `gls/separator.rs` does not exist yet. Add these as `SeparatorConfig` or phase defaults; they are not present in current `gls/consts.rs`.

**Confirmed:** Budget should stay outside Separator. Upstream `Separator::separate()` only polls `term.kill()`; `optimizer::optimize()` arms phase-specific timeouts before exploration/compression. REMA currently exposes only `OptimizerConfig.time_budget_ms` and even splits it per bin in `pack.rs`; Task 6 should translate that into a terminator, not teach Separator about milliseconds.

## Tests And Recommendation

**Confirmed property test 1:** after any `separate()` exit, `tracker_matches_layout` must hold for the active layout, because Separator mutates the layout via remove/re-place and then relies on cached tracker state thereafter. Use a fixed seed and a deliberately colliding one-bin `BPProblem`.

**Confirmed property test 2:** a feasible input should return `Feasible`/zero-loss without changing the layout. If you want Sparrow fidelity, do not assert "0 iterations": upstream still enters `move_items_multi()` once, but `move_items()` does zero moves because the colliding-candidate set is empty.

**Confirmed integration test:** add `engine/crates/rema-layout/tests/separator_integration.rs` (or `gls_integration.rs`) that builds a one-bin `BPInstance` via `jagua_adapter::to_jagua_instance()`, places five items with overlapping transforms using `BPPlacement`, runs `Separator::separate()` with seed 42, and asserts `Feasible` + `tracker_matches_layout` + zero per-item loss.

**Independent recommendation:** if the plan is a direct `SPProblem -> BPProblem` mechanical retype inside Separator, Codex disagrees. The already-ported REMA GLS core is layout-centric (`CollisionTracker`, `SeparationEvaluator`, `search_placement` all take `&Layout`), while BPP's real differences are layout-key churn and placement signatures. The lowest-risk port is a tiny bin-scoped adapter (`layout()`, `move_item()`, `save()`, `restore()`, `active_bin_id/lkey`) plus a sequential worker pool that preserves Algorithm 10 semantics.
