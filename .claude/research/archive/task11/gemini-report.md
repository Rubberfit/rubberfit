# Task 11 Research — Cross-Bin Swap Operators for REMA Portal

**Target:** `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
**Context:** S2.5b nesting engine migration, operating on the FFD initial assignment before the per-bin GLS `search::optimize` pass.

This document serves as the formal design and implementation specification for the Task 11 cross-bin swap operators. It answers the 10 research questions provided in the brief and establishes the strict guardrails necessary to maintain determinism and cardinality invariants.

## 1. Module Layout & Type Design

The cross-bin swap operators will live alongside FFD in the assignment module. They operate on `FfdAssignment` by value, acting as a functional pipeline phase that refines the initial layout.

```rust
// engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs

use crate::domain::{Bin, Part, PackError};
use crate::infrastructure::search::assignment::ffd::FfdAssignment;

/// Attempts to swap one item from Bin A with one item from Bin B.
/// Keeps the swap if it strictly improves the global polarization metric.
/// Returns the updated assignment, or the original if no improving swap was found.
pub fn swap_two(
    mut assignment: FfdAssignment,
    bin_a_idx: usize,
    bin_b_idx: usize,
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<FfdAssignment, PackError>

/// Greedily migrates up to N items from `from_bin_idx` to `to_bin_idx`.
/// Ignores whether `from_bin_idx` becomes completely empty.
pub fn migrate(
    mut assignment: FfdAssignment,
    from_bin_idx: usize,
    to_bin_idx: usize,
    max_items: Option<usize>,
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<FfdAssignment, PackError>

/// Identifies the bin with the lowest non-zero density and attempts to 
/// empty it by migrating its items to the highest-density bins with room.
pub fn unload_lightest_bin(
    mut assignment: FfdAssignment,
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<FfdAssignment, PackError>
```

**Why this shape?**
Passing `FfdAssignment` by value allows the operators to be chained cleanly (`assign = swap_two(assign, ...)?`). Returning a `Result<FfdAssignment, PackError>` matches the established idiom in `ffd.rs` and cleanly propagates geometry or domain errors.

## 2. Fit-Check Primitive & Metric

### Fit-Check Primitive
We must use **`warm_start::greedy_bottom_left`** as the probe for all swap and migrate operations.
* **Why not `search::optimize`?** `optimize` (even with a 50ms budget) is too slow for a double-loop probe across hundreds of item pairs. Furthermore, `ffd.rs` uses `greedy_bottom_left` to establish the baseline. Swaps evaluated using the same primitive are guaranteed to be structurally consistent with the FFD baseline.
* **Mechanism:** When testing a swap, we rebuild the `Vec<Part>` for both bins, adjust their quantities, and call `greedy_bottom_left` on both. If `probe.overflow == 0` for both bins, the swap is physically feasible.

### Density Metric (Polarization)
The brief asks: *"Keep if global density improves — define precisely."*
Since the sum of bin areas is fixed, and a pure swap between two bins preserves the total used area, the naive global density (`total_used / total_bin_area`) does not change during a 1:1 swap. 

Instead, we use the **Sum of Squared Densities (Polarization)** metric:
`Polarization = Σ (bin_used_area / bin_area)²`

* **Why Polarization?** Squaring the density heavily rewards variance. Moving an item from a 50% full bin to an 80% full bin increases polarization, mathematically encouraging the algorithm to make full bins fuller and light bins lighter. This directly facilitates `unload_lightest_bin`.
* **Lightest Bin:** The lightest bin is simply the bin with the smallest `(used_area / bin_area) > 0`.

## 3. Algorithm Specs & Pseudocode

### A. `swap_two`
**Goal:** Exchange one item between A and B to increase polarization.
1. Extract materialized parts for Bin A and Bin B using `items_for_seed` (or similar logic from `ffd.rs` that collapses duplicate `shape_id`s).
2. Sort the parts in Bin A and Bin B deterministically (e.g., by area descending, longest edge descending, `shape_id` ascending).
3. Loop `part_a` in A, and `part_b` in B:
   * Create trial part lists: `trial_a = A - part_a + part_b`, `trial_b = B - part_b + part_a`.
   * Check feasibility: `probe_a = greedy_bottom_left(bin_a, trial_a)`, `probe_b = greedy_bottom_left(bin_b, trial_b)`.
   * If both fit (`overflow == 0`), calculate the new Polarization.
   * Track the swap that yields the strictly largest increase in Polarization.
4. If a strictly improving swap is found, replace `assignment.per_bin[A]` and `assignment.per_bin[B]` with the successful probes.

### B. `migrate`
**Goal:** Move up to N items from Bin A to Bin B.
1. Extract materialized parts for Bin A and Bin B. Sort Bin A's parts by area descending (largest first).
2. Iterate through Bin A's parts. For each `part_a`:
   * Trial: `trial_b = B + part_a`.
   * Check feasibility: `probe_b = greedy_bottom_left(bin_b, trial_b)`.
   * If it fits, commit: `B = trial_b`, `A = A - part_a`. Decrement the `max_items` counter.
   * If `max_items` reaches 0, break.
3. Re-run `greedy_bottom_left` for the finalized A and B to generate the final `SeedResult`s. Replace them in `assignment`.

### C. `unload_lightest_bin`
**Goal:** Completely or partially empty the least-utilized bin.
1. Calculate densities for all bins. Find `source_idx` with the minimum density `> 0`.
2. Sort all other bins by density descending (target the fullest bins first).
3. Loop through `target_idx` in the sorted list:
   * Call `migrate(assignment, source_idx, target_idx, None, bins, items, clearance)`.
   * If `source_idx` becomes completely empty (density == 0), break.
4. **Accept Criterion:** Keep going even if some items overflow (i.e., stay in the source bin). A partial unload still reduces the scrap footprint of the lightest bin, which is desirable.

## 4. Concrete Test Scenarios

We must provide 9 tests covering behavioral correctness, idempotency, and determinism.

**`swap_two` Tests:**
1. `swap_two_improves_polarization`: Bin A has a 20x20 and 10x10. Bin B has a 20x20 and two 10x5s. Swapping the 10x10 and one 10x5 improves polarization. Ensure the swap executes and returns the new assignment.
2. `swap_two_rejects_infeasible`: Attempting a swap where the inbound item exceeds the bin's physical bounds (e.g., swapping a 20x20 item into a 15x15 bin) gracefully rejects the swap and returns the original assignment.
3. `swap_two_is_deterministic`: Invoking `swap_two` with the exact same inputs (including ties in item area) produces bit-for-bit identical layout outputs across multiple runs.

**`migrate` Tests:**
4. `migrate_moves_exactly_n_items`: Bin A has three 5x5 items. Bin B is empty. Calling `migrate` with `max_items = Some(2)` moves exactly two items, leaving one in Bin A.
5. `migrate_stops_when_target_full`: Bin A has three 10x10 items. Bin B only has room for one 10x10 item. Calling `migrate` with `max_items = None` moves exactly one item and leaves the rest in Bin A.
6. `migrate_preserves_cardinality`: After migration, `sum(A.placements) + sum(B.placements)` equals the total initial placements across both bins. No items are duplicated or lost.

**`unload_lightest_bin` Tests:**
7. `unload_lightest_bin_empties_bin`: Bin C has 10% density (one item). Bin A has room. Calling the operator leaves Bin C with 0 placements.
8. `unload_lightest_bin_partial_unload`: Bin C has two items. Bin A can only fit one. The operator moves one to Bin A and leaves one in Bin C, proving it tolerates partial unloads.
9. `unload_lightest_bin_idempotent`: Running the operator on an assignment where the lightest bin cannot be unloaded into any other bin results in no changes (returns identical assignment).

## 5. Integration Point Recommendation

**Verdict:** The operators should NOT be directly integrated into `pack.rs` during Task 11. 

According to the parent plan (Task 12: `"integrate FFD + swap into search::optimize_multi"`), the multi-bin coordination will be extracted into a dedicated orchestrator. 
Currently, `pack.rs` loops over bins:
```rust
let assignment = ffd_assign(...)?;
for (bin, seed) in ... { optimize(seed) }
```
In Task 12, this will become:
```rust
let assignment = ffd_assign(...)?;
let optimized_assignment = search::optimize_multi(assignment, request)?;
// inside optimize_multi: loop unload_lightest -> swap_two -> per-bin gls
```
For Task 11, strictly implement the pure functions in `cross_bin_swap.rs` and unit test them extensively. Leave `pack.rs` untouched.

## 6. Sharp Edges & Guardrails

1. **Duplicate `shape_id` Crash:** `search::optimize::replay_seed_into_layout` will hard-crash if a bin's config contains duplicate `shape_id` rows. When constructing trial lists for swaps or migrations, you **must** collapse quantities per `shape_id` (e.g., using `ffd.rs`'s `materialize_parts` pattern).
2. **Cardinality Preservation:** If a swap fails midway or a bug drops an item during `Vec<Part>` reconstruction, the entire pipeline is corrupted. `sum(placements)` + `overflow` must be rigorously asserted in tests.
3. **Infinite Loops:** `swap_two` must only accept swaps that yield a **strict** increase in the polarization metric (`new_metric > old_metric + epsilon`). A `>=` check will result in an infinite loop where items are swapped back and forth indefinitely if called in a loop later.
4. **Deterministic Iteration:** Rust's `HashMap` iteration is randomized. When building part lists or finding the "lightest" bin among ties, you must sort keys (by `shape_id` or `bin_idx`) to guarantee deterministic outputs.

## 7. Design Verdict

**VERDICT: APPROVE.**

The functional design leveraging `warm_start::greedy_bottom_left` as the fit-probe is correct and aligns perfectly with the established Task 10 FFD idioms. The introduction of the Sum of Squared Densities (Polarization) metric solves the ambiguous "global density" requirement mathematically. 

Codex is clear to proceed with implementation based on this document.
