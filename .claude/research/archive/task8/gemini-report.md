I will begin by exploring the engine's search and adapter modules to verify the existing structures and identify the exact lines for the requested updates.

I will now examine `engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs` to understand how `BPInstance` is constructed and how item IDs are mapped, which is crucial for the translation between `LayoutSnapshot` and `SeedResult`.

I will now examine `engine/crates/rema-layout/src/application/pack.rs` to understand how `search::optimize` is currently invoked and how it fits into the overall packing process.

I will examine `engine/crates/rema-layout/src/infrastructure/warm_start.rs` to see if there are existing helpers for creating `SeedPlacement` or `SeedResult` that I can leverage for the `LayoutSnapshot` translation.

# Task 8 Design Report: GLS Integration for BPP

This report outlines the design for Task 8 of the S2.5 refactor, transitioning the `search::optimize` function from a passthrough to a functional Guided Local Search (GLS) pipeline for the Bin Packing Problem (BPP).

---

### 1. Architectural Choice: Option B (Config Extension)
**Recommendation:** Extend `OptimizerConfig` in `engine/crates/rema-layout/src/infrastructure/search/mod.rs:29-37` to include `bin: Bin`, `items: Vec<Part>`, and `clearance: f64`.

**Rationale:** This choice preserves the `search::optimize` function signature (Plan Step 2) while providing the necessary domain context to rebuild the `BPInstance` using `jagua_adapter::to_jagua_instance`. It avoids bloating `SeedResult` with vendor-specific types (Option A) and maintains clean architectural layering where the search module remains a consumer of domain objects rather than a repository of transformed vendor state.

---

### 2. Budget Wiring and Terminator Arming
**Strategy:** Allocate 100% of `time_budget_ms` to the `exploration_phase`. Since `compression_phase` is an identity function in this BPP port (Task 7), a split is unnecessary.

- **Arming:** At the start of `optimize()`, arm a `BasicTerminator` using `BasicTerminator::with_timeout(Duration::from_millis(config.time_budget_ms))`.
- **Safety Margin:** Do not implement a hard-coded safety margin inside `optimize()`. The orchestrator in `application::pack.rs:18-20` already divides the total budget by the number of bins. Any "fast-mode" wall-clock buffers (e.g., the 1000ms difference in `rust-perf.test.ts`) are handled at the `PackRequest` level or by the test runner.
- **Improvement Budget:** The `improvement_budget_ms` field on `OptimizerConfig` will remain a TODO for Task 14, where it will be wired to a `Terminator` that tracks stall time.

---

### 3. LayoutSnapshot → SeedResult Translation
**Proposal:** A private helper `snapshot_to_seed(snap: LayoutSnapshot, items: &[Part], bin_id: &str) -> SeedResult`.

**Logic:**
1. **Placements:** Iterate `snap.placed_items` (SlotMap).
   - Retrieve the original `Part` using `items[pi.item_id]`.
   - `rotation_rad = pi.d_transf.rotation as f64`.
   - `(x, y) = (pi.d_transf.translation.0 as f64, pi.d_transf.translation.1 as f64)`.
   - **Polygon:** Reconstruct by applying `pi.d_transf.compose()` to the original `Part.polygon`.
   - **Instance Index:** Maintain a `HashMap<usize, u32>` to count placements per `item_id`. Assign `instance_index = count++`. Note: `pack.rs:53` re-indexes these globally, so stable identity across `optimize` calls is not required here.
2. **Overflow:** Calculate as `total_requested_quantity - snap.placed_items.len()`.
   - `total_requested_quantity = items.iter().map(|p| p.quantity).sum::<u32>()`.

---

### 4. Stale-Wording Cleanup
Apply the following updates to align documentation with the BPP-specific 100% exploration strategy:

- **`search/terminator.rs:8-9`**: 
  - *Old:* "...arm per phase (80/20 explore/compress split)."
  - *New:* "...arm for the exploration phase (compression is identity per Task 7)."
- **`search/gls/explore.rs:25-26`**: 
  - *Old:* "Task 8 splits time_budget_ms 80/20 between explore and compress."
  - *New:* "Task 8 allocates 100% of time_budget_ms to exploration; compression is identity in BPP (Task 7)."

---

### 5. Existing Test Updates
Replace the passthrough tests in `search/mod.rs` with functional verifications. Since `OptimizerConfig` now requires `Bin` and `Part`, use small rect fixtures.

- **`real_optimize_lifts_density_above_warm_start`**: Assert that for a tight fixture, GLS finds a solution where the greedy warm-start might have failed or produced a lower-density layout.
- **`respects_time_budget_deadline`**: Set `time_budget_ms: 1`. Assert the function returns within a small margin of the deadline, even if infeasible.
- **`preserves_overflow_for_items_that_dont_fit`**: Provide a fixture where `total_area(items) > area(bin)`. Assert `SeedResult.overflow > 0`.
- **`determinism_same_seed_same_output`**: Assert `optimize(seed, cfg_with_seed_42) == optimize(seed, cfg_with_seed_42)`.

---

### 6. Parity Test Impact
**Recommendation:** **DEFER** tightening cross-engine tolerances.
Task 8's primary goal is the "density lift" provided by real GLS. Updating `tests/packing/parity/__snapshots__/parity.test.ts.snap` via `npm run test -- tests/packing/parity -u` is mandatory to reflect the new optimal layouts. Plan Task 19 is the correct stage for tightening tolerances once the engine behavior is stabilized.

---

### 7. Determinism
**Implementation:** `search::optimize` must initialize `Xoshiro256PlusPlus` from `config.seed.unwrap_or_else(|| rand::random())`.
- **Test:** A dedicated test in `search/mod.rs` will assert that two calls with `seed: Some(42)` produce bit-identical `SeedResult` objects. f64 coordinates produced from `f32` vendor outputs are deterministic on the same architecture.

---

### 8. Performance Budget
**Recommendation:** Rely on the `BasicTerminator` for budget enforcement.
- **Safety Belt:** Do not use `max_conseq_failed_attempts` in the production `optimize` call (leave as `None` per `ExplorationConfig::paper_defaults()`). The `time_budget_ms` is the primary constraint.
- **Risk:** The 3s wall-clock budget for "fast" mode in `rust-perf.test.ts` is tight. If `to_jagua_instance` (jagua-rs import) or the first `separate()` call exceeds 1s, we risk failure. Ensure `BPInstance` reconstruction happens once per `optimize` call.

---

### 9. Deviations List for `search/mod.rs`
(To be added to the file header)
- **Passthrough → GLS:** Replaced identity logic with a real exploration-then-compression pipeline.
- **Context Reconstruction:** `BPInstance` is rebuilt inside `optimize` using `Bin` and `Part` context added to `OptimizerConfig`.
- **BPP Budgeting:** 100% of time budget allocated to exploration; compression is preserved as a no-op seam.
- **Coordinate Mapping:** Implemented f32 (vendor) to f64 (domain) translation with transformed polygon reconstruction.
- **Deferred Features:** `improvement_budget_ms` and cooperative cancellation remain gated on Task 14.

---

### 10. Sequence Check
- **Helper Requirement:** A `Transformation` applier for `rema_geom::domain::Point2D` may be needed if not already present in the `rema-geom` crate to reconstruct the placed polygons.
- **Task 12 Foundation:** Task 8 provides the "single-bin optimizer" that Task 12 will wrap in a multi-bin coordination loop. By keeping the `items` in `OptimizerConfig` restricted to the "remaining" set for that bin, we ensure Task 8 is correctly scoped for single-bin work while being extensible for Task 12's cross-bin swaps.
