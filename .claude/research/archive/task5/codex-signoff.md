# Task 5 plan sign-off — Codex verdict

**Verdict: APPROVE WITH CHANGES**

1. **Layout-key churn:** Cleared for Task 5. Plan §1/§2.4 scopes `Separator` to `Layout`, so the `BPProblem` key-churn paths flagged in the original report (`place_item/remove_item/restore`: jagua-rs `problem.rs` lines 45-99, 97-158) are outside this task's scope. `Layout` itself exposes the simpler `save/restore/place_item/remove_item` API (jagua-rs `layout.rs` lines 51-99). Parent plan Task 8 is still per-bin; multi-bin coordination is explicitly Task 12, so this is deferred, not smuggled in.

2. **Algorithm 10 semantics with `Vec<SeparatorWorker>`:** Not fully cleared. Plan §2.2 `move_items_multi` matches sparrow `separator.rs` lines 997-1042, but §2.1 sets `n_workers=1`. Collapsing to one worker changes the algorithm relative to upstream. Sequential execution is fine, but if the claim is "faithful to Algorithm 10," the default worker count should stay >1 or the deviation must be explicitly documented.

3. **Weighted vs unweighted loss:** Cleared. Plan §2.2 preserves unweighted loss for success/incumbent updates and weighted loss for worker selection; matches sparrow `separator.rs` lines 902-905, 920-949, 1031-1034.

4. **Weight retention:** Cleared. Plan §2.2 `rollback(Some)` → `restore_but_keep_weights`, `rollback(None)` → `CollisionTracker::new`, matching sparrow `separator.rs` lines 1048-1068.

5. **Sparrow defaults:** Partially cleared. The exploration values match sparrow `config.rs` lines 549-557 (`iter_no_imprv_limit=200`, `strike_limit=3`). However, that same upstream block defaults `n_workers=3`, not `1`. The plan should not describe `n_workers=1` as the upstream default.

6. **`search_placement(..., Some(pk), ...)`:** Cleared. Plan §2.2 matches sparrow `worker.rs` lines 568-577.

7. **RNG determinism:** Partially cleared. Seed derivation order in Plan §2.2 matches sparrow `separator.rs` lines 823-839, but `n_workers=1` changes the number of per-iteration RNG streams explored versus upstream.

8. **`move_item` / BPP placement signature:** Cleared. Plan §2.2 uses `Layout`-local remove/place semantics, matching jagua-rs `layout.rs` lines 73-99 and avoids `BPPlacement`/`BPLayoutType` entirely.

**Required change before implementation:** Stop describing `n_workers=1` as the upstream/paper default. Either use upstream `n_workers=3`, or explicitly mark `1` as an intentional S2.5a deviation and document why. All other original concerns are cleared.
