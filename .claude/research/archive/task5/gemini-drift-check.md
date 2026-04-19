# Task 5 drift check — Gemini

**Verdict: APPROVE**

Implementation at `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` faithfully applies every required sign-off fix. All 8 checklist items land, all 3 nice-to-haves land.

## Required fixes (8/8)

1. **`Separator::move_item` dropped** — YES. Only `SeparatorWorker::move_item` exists at `separator.rs:432`. Deviation documented in header at `separator.rs:18-20`. Gemini's "drop it" recommendation won over the `#[allow(dead_code)]` alternative.
2. **`self.layout.save()` once per improvement** — YES. `separator.rs:269` computes `best_snap = self.layout.save()` once; passed by reference to `listener.report_improving(&best_snap)` at `:270` and moved into `min_loss_sol.0` at `:274`. No duplicate save.
3. **`move_items_multi` n_workers handling** — Codex's fix landed. `SeparatorConfig::exploration()` sets `n_workers: 3` at `separator.rs:73`, matching upstream `sparrow/src/config.rs:549-557`. No fast-path in `move_items_multi` (`:324-357`) — the `for worker in self.workers.iter_mut()` at `:329` runs unconditionally. Gemini's fast-path was superseded because the default is never 1 in practice; adding a branch for a non-default path is dead code.
4. **Independent-per-worker RNG rationale** — YES. Documented twice: struct-level doc at `separator.rs:173-176` ("Workers carry independent RNGs seeded from the master in `Separator::new`. Sequential execution is fine — the independent seeds are what guarantee each worker explores a different item-ordering trajectory.") and method-level at `:320-323`.
5. **Test 3 fixture comment** — YES. `separator.rs:551-552`: "initial overlap is load-bearing; do NOT 'fix' the fixture by spreading them out."
6. **Test 6 `weighted_loss_non_increasing_across_separate`** — YES. Present at `separator.rs:607-639`, 3-item overlap at (10,10)/(12,12)/(14,14), `strike_limit=1, iter_no_imprv_limit=10`, asserts `after <= before * 1.001`. Matches plan §3 Test 6 spec verbatim.
7. **§4 step 1 split so `Separator::new` is concrete** — YES. Plan at `2026-04-18-s2.5-task5-separator.md:285-287` splits into 1a (skeleton), 1b (`Separator::new` + `SeparatorWorker` construction concrete), 1c (other methods `unimplemented!()`). Implementation `Separator::new` at `separator.rs:186-211` is a real constructor.
8. **§5.1 `cargo build --release -p rema-layout`** — YES. Plan §5.1 at `2026-04-18-s2.5-task5-separator.md:312` includes the release gate with rationale ("debug_assert is stripped under release").

## Nice-to-haves (3/3)

- `SeparateOutcome::Infeasible.ct_snapshot` rename — YES at `separator.rs:118`.
- `#[derive(Debug)]` on `SeparateOutcome` — YES at `separator.rs:109`.
- Cached `min_loss_sol.0` on Feasible path — YES at `separator.rs:309`, returns `min_loss_sol.0` directly (not a second `self.layout.save()`).

## Final note

No drift from plan. Ship as-is.
