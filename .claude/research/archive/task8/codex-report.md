# Task 8 second opinion — Codex (saved by Claude; sandbox was read-only)

Verdict: **APPROVE** for Claude to draft the plan, but only with the corrections below.

1. **Choose B, not A or C.** Add `bin: Bin` and `items: Vec<Part>` to `OptimizerConfig` at the existing `application::pack -> search::optimize` seam in `engine/crates/rema-layout/src/application/pack.rs:24`. `C` is forbidden. `A` makes `SeedResult` carry request context it does not semantically own, and if that payload is `BPInstance` it breaks `PartialEq` immediately because `BPInstance` is only `Clone + Debug`, not `PartialEq`. `B` keeps signature stability, keeps jagua construction inside infrastructure, and uses data `pack()` already has at the callsite.

2. **Risks Gemini might miss.**

   - `SeedResult::PartialEq`: adding `BPInstance` to `SeedResult` does not preserve derive-based equality. Adding `Bin`/`Vec<Part>` would compile because domain types derive `PartialEq`, but it still widens warm-start equality and forces test fixture churn in `warm_start.rs` and `search/mod.rs`.

   - `SeedPlacement.polygon`: the output must be the transformed **original** polygon, matching warm-start's current behavior in `warm_start.rs:62`. Do **not** serialize jagua's internal `PlacedItem.shape`; that shape is centroid-pretransformed and can be clearance-inflated/simplified. Use jagua's `int_to_ext_transformation` from `export.rs:34` and apply it to the original shape.

   - Overflow bookkeeping: recover it as `sum(item_qty(id) - placed_count_for_item_id)` from the passed-in items / `BPInstance`, not from final layout size alone. The app later computes true overflow from `remaining` in `pack.rs:97`, so per-bin `SeedResult::overflow` should stay "unplaced on this bin".

   - Determinism: seeded runs stay deterministic if Task 8 calls `rng::from_seed(config.seed)` once and keeps worker count fixed. Worker RNGs are deterministically derived from the master via `rng.random()` in `separator.rs:212`. The real risk is nondeterministic output ordering during layout->seed translation; sort placements before renumbering.

   - Snapshot churn: there are **9** parity fixtures, so **9 rust snapshot entries** will change in `parity.test.ts.snap:124`. Refresh is mechanically a simple `-u`, but it should not be blind; inspect all 9 rust diffs. Legacy snapshots should remain unchanged.

   - **Extra risk:** Task 8's single-bin GLS cannot increase placed count or reduce overflow, because the separator only moves already-placed items and preserves cardinality in `separator.rs:390`. That makes any "density > warm-start baseline" expectation wrong for an already-feasible warm start.

   - Extra risk: `PlacedItem` stores `item_id`, not demand-instance identity, in `placed_item.rs:18`. `instance_index` must be reassigned deterministically per shape on the way back. That is acceptable because `application::pack` already discards optimize's incoming `instance_index` and rewrites it.

3. **Budget reallocation:** go **100% explore / 0% compress**. `compress.rs:19` already documents that BPP compression is identity. Do not reserve 5% for Task 12 now; dead budget just hurts fast mode, and Task 12 can rebalance when it has a real second phase.

4. **Test strategy:** yes on translation unit tests, but **fix the integration assertion**. Unit tests should cover `seed -> Layout` and `LayoutSnapshot -> SeedResult` round-trips with off-origin polygons, verifying external/internal transform conversion and transformed original polygons. The full-pipeline integration test should assert deterministic output plus legality preservation, or use a deliberately colliding synthetic seed and assert collision loss goes to zero while placed count stays constant. **A density-improvement assertion belongs to a later task** that can actually add or swap items, not Task 8.

5. **`rust-perf.test.ts` risk:** for the current REMA parity fixtures, less than 3s fast mode looks realistic. Those fixtures are small (1-20 items, 1-2 bins, max 26 vertices) and the current `pack-cli` binary runs them in roughly 4-43ms. Real GLS will be slower, but many warm starts will be collision-free, and `move_items()` only touches colliding items in `separator.rs:421`. Keep the 3s guard for typical fixtures, but add one adversarial dense/collision-heavy perf fixture because that is where the budget gets stressed.

6. **`improvement_budget_ms`:** defer real wiring to Task 14. The current terminator API is too thin for honest "time since last improvement" semantics. If someone insists on wiring it now, do it with a listener-updated `last_improvement_at` plus a composite terminator; do not fake it by mapping it onto iteration caps or phase percentages.

Bottom line: **B + 100/0 budget + original-polygon translation + corrected test expectations** is the defensible path.
