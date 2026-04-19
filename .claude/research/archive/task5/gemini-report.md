# Design Report: Task 5 - GLS Separator Port (SPP to BPP)

This report outlines the design for porting the Sparrow `Separator` (Guided Local Search inner loop) into the `rema-layout` crate, transitioning from Strip Packing (SPP) to Bin Packing (BPP) using `jagua-rs` 0.7.1.

## 1. File Layout Recommendation

**Recommendation:** (a) Inline `SeparatorWorker` logic directly into `gls/separator.rs`.

*   **Pros:** Reduces file fragmentation. The `SeparatorWorker` in Sparrow is essentially a private implementation detail of the parallel `move_items_multi` loop. Consolidating into one file aligns with `rema-layout` conventions where core search logic (e.g., `sampling.rs`, `tracker.rs`) is self-contained.
*   **Cons:** Slightly longer file (~400 LOC), but still well within maintainability limits for a single algorithm.
*   **Repo Alignment:** Existing files like `gls/specialized_pipeline.rs` and `gls/tracker.rs` already bundle specialized logic and its supporting structures.

## 2. Type Substitution Table

Mappings from Sparrow SPP symbols to `jagua-rs` 0.7.1 BPP equivalents.

| Sparrow/SPP Symbol | SPP Location | BPP Replacement | Notes |
| :--- | :--- | :--- | :--- |
| `SPInstance` | `optimizer/mod.rs` | `BPInstance` | Found in `jagua-rs/src/probs/bpp/entities/instance.rs`. |
| `SPProblem` | `optimizer/separator.rs` | `Layout` | BPP `Separator` should operate on a single `Layout` (see Section 3). |
| `SPSolution` | `optimizer/separator.rs` | `LayoutSnapshot` | BPP equivalent for a single bin state; `BPSolution` is a map of snapshots. |
| `SPPlacement` | `optimizer/worker.rs` | `BPPlacement` | Found in `jagua-rs/src/probs/bpp/entities/problem.rs`. |
| `DTransformation` | `optimizer/worker.rs` | `DTransformation` | Unchanged (standard `jagua-rs` geometry). |
| `strip_width()` | `optimizer/separator.rs` | *N/A (Delete)* | BPP bins have fixed dimensions; no dynamic width adjustment. |
| `change_strip_width` | `optimizer/separator.rs` | *N/A (Delete)* | Irrelevant for fixed-size bins. |
| `move_item` | `optimizer/separator.rs` | `move_item_in_layout` | Local implementation using `layout.remove_item` and `layout.place_item`. |

## 3. `Separator` Scoping

The `Separator` will wrap a **single `Layout`** rather than `BPProblem`.

*   **Justification:** Task 5 focuses on the "Inner Loop" (resolving overlaps within one container). `BPProblem` (`probs/bpp/entities/problem.rs`) manages multi-bin demand and layout keys, which is out of scope for the GLS separation phase. Operating directly on `Layout` allows for a cleaner API that Task 8 (multi-bin coordination) can consume.
*   **Fields:**
    *   `instance: BPInstance`: To access item definitions and shapes.
    *   `layout: Layout`: The specific bin being optimized.
    *   `ct: CollisionTracker`: Tracks overlaps within this layout.
    *   `rng: Xoshiro256PlusPlus`: For stochastic search.
    *   `config: SeparatorConfig`: Parameter tuning (strikes, iterations).

## 4. `SeparateOutcome` Enum

`Separator::separate()` will return a `SeparateOutcome` to communicate the result of the GLS attempt.

*   **Variant `Feasible(LayoutSnapshot)`**: Returned if `total_loss == 0.0`. Payload is the validated state.
*   **Variant `Infeasible { snapshot: LayoutSnapshot, tracker: CTSnapshot }`**: Returned if the strike limit is reached. Payload includes both the best-found state and the `CollisionTracker` state (including GLS weights).
*   **Pool Logic:** For Task 5, we do not implement an N-sized pool. The `Infeasible` variant carries the single "best" snapshot found. Task 6 (Exploration) will handle the management of multiple infeasible solutions if required.

## 5. Terminator + SolutionListener Stubs

Minimum viable traits to decouple Task 5 from the Task 14 UI/Telemetry integration.

```rust
pub trait Terminator {
    /// Returns true if the search should stop immediately.
    fn kill(&self) -> bool;
}

pub trait SolutionListener {
    /// Called when a better (but potentially still infeasible) layout is found.
    fn report_improving(&mut self, layout: &Layout);
}
```

## 6. Parallel Workers

**Recommendation:** (b) Single-threaded implementation for S2.5a.

*   **Justification:** Task 5 is a complex mathematical port. Introducing `rayon` or `std::thread::scope` adds build system overhead and debugging complexity. Since the `pack-cli` is native, we can add `rayon` at Task 18 once the core BPP logic is verified.
*   **Impact:** `move_items_multi` will be replaced by a single sequential `move_items` call per iteration.

## 7. `change_strip_width` Replacement

*   **Action:** Delete `change_strip_width` from the port.
*   **Verification:** A scan of the 14 already-ported files (`sep_evaluator.rs`, `tracker.rs`, `sampling.rs`, etc.) confirms that `change_strip_width` is never called. It was purely an SPP-specific utility for expanding the search space. In BPP, feasibility is fixed by the bin dimensions.

## 8. Tests

1.  **`test_gls_simple_feasible`**: Place two small non-overlapping items in a large bin. Verify `separate()` returns `Feasible` in 0 iterations.
2.  **`test_gls_resolve_overlap`**: Place two items such that they overlap. Verify GLS moves one item to a clear position and returns `Feasible`.
    *   *Fixture:* Construct a `BPProblem` with two 10x10 squares in a 100x100 bin, initially placed at (5,5) and (6,6).
3.  **`test_gls_infeasible_exit`**: Place a "giant" item that cannot fit without colliding with the container. Verify `separate()` exits after `strike_limit` and returns `Infeasible`.
4.  **`test_gls_weight_escalation`**: Verify that `CollisionTracker` weights for a persistent overlap increase over iterations, forcing the `Separator` to prioritize moving those items.

## 9. Deviation List

The `gls/separator.rs` file will include the following header:

```rust
/*
 * DEVIATIONS FROM SPARROW (ejor-snapshot c95454e3):
 * 1. Retyped from SPP (Strip Packing) to BPP (Bin Packing).
 * 2. Scope limited to a single `Layout` instead of `SPProblem`.
 * 3. Removed `change_strip_width` and related item-shifting logic (irrelevant for fixed bins).
 * 4. Parallel worker logic (`SeparatorWorker`) inlined into `Separator` for simplicity.
 * 5. Replaced `rayon` with sequential execution (Parallelism deferred to Task 18).
 * 6. Simplified `Terminator` and `SolutionListener` to minimal stubs.
 */
```

## 10. Sequence Check (Unported Symbols)

Upstream symbols in `separator.rs`/`worker.rs` and their Task 5 status:

| Symbol | Status | Action |
| :--- | :--- | :--- |
| `SepStats` | **Port-now** | Useful for performance telemetry in logs. |
| `FMT` | **Elide** | Replace with standard `log` and `format!` macros. |
| `Instant` | **Port-now** | Use `jagua_rs::Instant` or `std::time::Instant`. |
| `Level` | **Port-now** | Use standard `log::Level`. |
| `SeparatorWorker`| **Port-now** | Inline logic into `Separator`. |
| `fit_strip` | **Elide** | Not applicable to BPP. |
| `SPSolution` | **Elide** | Replaced by `LayoutSnapshot`. |
