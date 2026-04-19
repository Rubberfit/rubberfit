# Design Report: Task 7 - BPP Compression Phase (GLS Polish)

## 1. Choice: (C) GLS Polish (The "Layout Hardening" Interpretation)

I commit to **Interpretation (C): GLS Polish**. 

In the transition from SPP (Strip Packing) to BPP (Bin Packing), we must acknowledge a fundamental shift in the optimization objective. In SPP, "compression" has a physical analogue: shrinking the container (`change_strip_width` in sparrow's `compress.rs:L85`). In BPP, the container is a rigid constraint. Attempting to "shrink" a BPP bin is a category error; a layout that fits in 95% of a bin is no more "feasible" than one that fits in 99.9%. 

However, Interpretation (A) — the no-op — is a surrender of the 20% budget that ignores the requirements of Task 12 (cross-bin swap). Interpretation (B) — geometric compaction — while visually appealing, introduces a "gravity" heuristic that is often at odds with the GLS penalty system, potentially leading to "clumping" that makes resolving overlaps harder.

**Interpretation (C) GLS Polish** is the superior choice because it treats the Compression Phase as a **"Layout Hardening"** pass. While `exploration_phase` (Algorithm 12) exits the moment a feasible layout is found to maximize exploration breadth, `compression_phase` (Algorithm 13) uses the remaining budget to deepen the search. For BPP, this manifests in two critical ways:

1.  **Infeasible Refinement:** If `explore.rs` failed to find feasibility, `compress.rs` acts as a "second wind" with tighter convergence parameters (`strike_limit=5` vs `3`). It spends the 20% budget attempting to drive `total_loss` to zero, which `explore.rs` might have missed due to its broader disruption logic.
2.  **Feasible Robustness:** If the layout is already feasible, `compress.rs` reshapes the layout to optimize a "secondary objective" (Waste Fragmentation). By consulting `BppObjective::is_better`, we can favor layouts that minimize the bounding box of placed items. This is not just "polish"; it is **Task 12 preparation**. A "tightened" layout creates contiguous free space, maximizing the probability that a swap operator in Task 12 can successfully insert a large part from a neighboring bin.

Sparrow's paper (arXiv:2509.13329) frames the `separate` call (Algorithm 9) as the core engine of stability. By reusing the `Separator` from `separator.rs:L142` in a high-intensity polish mode, we stay idiomatic to the port. We satisfy the "never worsens" constraint because `BppObjective::is_better` (Task 1) acts as a strict guard. If the polish pass results in a higher loss or a worse bounding box, it is rejected. This interpretation earns its 20% budget by converting raw "feasibility" into "swappable quality."

## 2. If A (no-op)
N/A. I reject the no-op interpretation as it fails to provide the "polished" state required for the Task 12 cross-bin swap assignment.

## 3. If B (geometric compaction)
N/A. Geometric compaction will be handled as a tie-breaking secondary term within the GLS Polish objective rather than a separate greedy algorithm.

## 4. (C) GLS Polish: Criterion and Tuning
The BPP Compression Phase will invoke `sep.separate` with a "Refinement" configuration. 

*   **Criterion:** We accept a new layout iff `BppObjective::is_better(new_state, current_state)`. 
*   **Tie-breaking (The "Polish"):** Since `BppObjective` (as defined in `objective.rs:L41`) currently only counts placements and overflow, two feasible layouts will score identically. To enable true "polish," we will extend the `BppObjective` (or use a local comparator) to include a **Waste Fragmentation Term** (e.g., `total_ch_area / bounding_box_area`).
*   **Tuning Parameters:**
    *   `strike_limit`: Increased to **5** (from 3 in `ExplorationConfig`). We want more GLS weight updates to "harden" the layout.
    *   `iter_no_imprv_limit`: Reduced to **100** (from 200). We prefer more strikes (weight resets) over long plateaus.
    *   `stddev`: Reduced to **0.1** for sampling (narrower, more focused moves).

## 5. BppObjective::is_better wiring
`BppObjective` operates on a `SearchState` (multi-bin), but `compression_phase` operates on a single `Layout`. 

**Proposed Solution:** Add a "lifting" helper in `gls/compress.rs` that wraps the `LayoutSnapshot` into a dummy `SearchState`.

```rust
fn is_layout_better(obj: &BppObjective, new_layout: &Layout, current_best: &LayoutSnapshot) -> bool {
    let new_snap = new_layout.save();
    // Lift snapshots to SearchState via a SeedResult shim
    let state_a = SearchState::from_layout_snapshot(&new_snap); 
    let state_b = SearchState::from_layout_snapshot(current_best);
    obj.is_better(&state_a, &state_b)
}
```
This is cleaner than adding `is_better(&Layout, &Layout)` to the `Objective` trait, as it preserves the trait's focus on the global `SearchState` while allowing phase-specific comparisons.

## 6. File Layout
*   **File:** `engine/crates/rema-layout/src/infrastructure/search/gls/compress.rs`.
*   **Listener:** We will reuse `SolutionListener::report_improving` (from `separator.rs:L122`). There is no need for `report_compress_improving` if the `BppObjective` is the sole arbiter of "better." The orchestrator in Task 8 will distinguish phases in the logs.

## 7. CompressionConfig Shape
We adapt sparrow's `CompressionConfig` (upstream `config.rs:L76`) to the BPP context:

```rust
#[derive(Debug, Clone, Copy)]
pub struct CompressionConfig {
    /// Number of high-intensity separate() passes to attempt.
    /// Replaces sparrow's shrink_range.
    pub n_passes: usize,
    /// Probability of a "shaking" move between passes.
    pub disruption_prob: f32,
    pub separator_config: SeparatorConfig,
}
```
Fields like `shrink_range` and `shrink_decay` are dropped as they rely on the deleted `change_strip_width` (Task 5).

## 8. Tests
`gls/compress.rs` will include tests for:
1.  **Feasible Stability:** A feasible seed passed to `compression_phase` must return a layout with 0 overflow and identical item count.
2.  **Infeasible Progress:** A seed with 10.0 loss must return a layout with $\le 10.0$ loss.
3.  **Terminator Sensitivity:** If `term.kill()` is true, the phase must exit immediately returning the `init_sol`.
4.  **Determinism:** Fixed seed + same input = bit-identical `LayoutSnapshot`.
5.  **Objective Tie-break:** Verify that if two layouts have 0 overflow, the one with the tighter bounding box (once the objective is extended) is preferred.

## 9. Deviations List
```rust
// Deviations from upstream (sparrow compress.rs):
//   1. SPP -> BPP: Removed change_strip_width and the shrink-retry loop. 
//      BPP bins are fixed; "compression" is redefined as GLS Polish.
//   2. Accept/Reject: Consults BppObjective::is_better instead of 
//      checking get_total_loss() == 0.0. This allows polishing 
//      already-feasible layouts.
//   3. Config: Replaced shrink_range/shrink_decay with n_passes logic.
//   4. State: Operates on Layout/LayoutSnapshot instead of SPSolution.
```

## 10. Sequence Check
*   **New in this Task:** `gls/compress.rs` logic, `CompressionConfig` definition, and the `BppObjective` integration for accept/reject logic.
*   **Retained:** `Separator` and `CollisionTracker` (Tasks 3-5), `SolutionListener` and `Terminator` traits (Task 6), and the `BppObjective` (Task 1). 
*   **Prerequisite:** Task 6's `exploration_phase` must be capable of passing its best `LayoutSnapshot` to this module.
