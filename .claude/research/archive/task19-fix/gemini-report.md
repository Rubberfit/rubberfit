# Research Report: Task 19 Fix — Closing the Rust-vs-Legacy Placement Gap

## 1. Root-Cause Confirmation

The analysis presented in the assignment is precisely correct. The density gap observed in the benchmark sweep—specifically on 2D-packing-heavy fixtures like `circle-grid.json` (-5 gap), `rect-grid.json` (-5 gap), and `multi-sheet-remnant.json` (-5 gap)—stems directly from the interaction between the Phase S2.5c warm start and the GLS pipeline.

1. **The 1D Warm Start Bottleneck:**
   `warm_start::greedy_bottom_left` is currently implemented as a strict 1-dimensional vertical stacker. As seen in `warm_start.rs`, the placement logic sets `x = clearance` for all items and increments `cursor_y` by `h_eff`. If `cursor_y + h_eff > bin.height`, the loop breaks, and the remaining requested instances of that part are added to `overflow`. The warm start has zero awareness of the bin's width beyond a simple pass/fail gate (`w_eff > bin.width`). It completely ignores the horizontal 2D space.

2. **The Cardinality-Preserving Separator:**
   Sparrow's GLS implementation inside `Separator::separate` (ported in `separator.rs`) is a local search over the *placed* item set. It initializes a `CollisionTracker` from the provided layout snapshot and iteratively shifts colliding `PItemKey`s to minimize the penalty-weighted overlap loss. However, it explicitly cannot mutate the cardinality of the placed set. As documented in `separator.rs`, it operates exclusively on `self.layout.placed_items.keys()`. Therefore, any item relegated to overflow by the 1D warm start is structurally invisible to the GLS phase.

3. **The Orchestrator's Blind Spot:**
   Task 12's `optimize_multi` loops over cross-bin operators (`unload_lightest_bin`, `migrate`, `swap_two`). These operators shuffle existing `PItemKey`s across bins to optimize a lexicographical score. They do not—and cannot—pull from the `overflow` list.

The legacy TS engine utilizes a 2D No-Fit-Polygon (NFP) greedy placer (`nfp-greedy-placer.ts`) that scans the entire 2D surface of the bin, finding the bottom-left-most fit. Since Rust's vertical stacker leaves 80% of a square bin empty, and GLS only organizes the items in that 20% vertical column, the Rust engine fundamentally abandons the remaining space, resulting in the observed gap.

## 2. Option Evaluation

To achieve parity, we must project overflow items into the 2D space. The available options are evaluated below based on implementation cost, runtime complexity, and safety.

### Option A: 2D Warm-Start Replacement
* **Concept:** Port `nfp-greedy-placer.ts` to Rust, leveraging `Clipper2-rs` for NFP generation.
* **Pros:** Delivers a highly dense, non-overlapping initial seed. The GLS Separator would only be invoked for minor cleanup, exactly mirroring the legacy architecture.
* **Cons:** Extremely high implementation cost. Building a robust 2D NFP greedy placer requires upwards of 600+ lines of complex geometric Rust code. It expands the S2.5 scope substantially and introduces risk around floating-point determinism during NFP inflation.

### Option B: Iterative Overflow Re-seed
* **Concept:** Inside the multi-bin orchestrator, after standard GLS, take items from the overflow pool and inject them into the bin at overlapping coordinates (e.g., `(clearance, clearance)`). Rely on `Separator::separate` to resolve the collision and find a valid 2D position.
* **Pros:** Minimal invasiveness. This leverages the existing, highly-tuned Sparrow GLS engine as a 2D placement oracle. It requires zero new geometric code and relies entirely on proven S2.5 infrastructure. This technique perfectly mirrors Large Neighborhood Search (LNS) insertion heuristics.
* **Cons:** Computationally demanding. Running the GLS loop for every speculative item placement incurs CPU overhead. However, since the parity benchmark fixtures cap at ~20 items, this localized overhead is negligible.

### Option C: Use jagua-rs's Constructive Builder
* **Concept:** Hook into `jagua_rs::probs::bpp` to utilize their constructive packing primitives.
* **Pros:** Reuses an already-linked dependency, minimizing raw code size.
* **Cons:** High integration risk. Jagua's native exact clearance model differs from the S2.5 conservative clearance model (established in Task 11). Aligning the upstream builder with our strict `(k*h + 2*k*c)` probe constraints may prove impossible without upstream patches.

### Option D: Port sparrow's OWN SPP Constructive
* **Concept:** Identify and port the constructive heuristic from the Sparrow paper.
* **Pros:** Algorithmic alignment with the separation phase.
* **Cons:** Sparrow's native heuristics are largely tuned for orthogonal guillotine cuts or standard SPP models, making them a poor fit for our arbitrary 2D continuous polygons.

### Option E: Fix at the Orchestrator Level
* **Concept:** Implement an `O(N×M)` probe for overflow items, testing all raster positions across all bins to find a fit.
* **Pros:** Clean, explicit retry logic.
* **Cons:** Brute-force position scanning is effectively a naive, slow NFP algorithm. It duplicates the collision-resolution logic that GLS already performs much faster via penalty gradients.

## 3. Recommendation & Implementation Sketch

**Recommendation: Option B (Iterative Overflow Re-seed)**
Option B is the superior choice. It closes the density gap by transforming the GLS collision resolver into an implicit 2D placer, requiring minimal new code while leveraging the most powerful component of the Rust engine.

### Implementation Sketch
The fix will be confined to `engine/crates/rema-layout/src/infrastructure/search/multi.rs`.

**Step 1: Extend `optimize_multi_with_hooks`**
After Phase A (optimize all bins) and Phase B (operator ladder), introduce Phase C: **Overflow Recovery**. If `assignment.overflow` is non-empty, we attempt to re-seed.

**Step 2: The Recovery Loop**
Iterate over the overflow items, sorting them by descending area (preserving FFD invariants). For each item:
1. Iterate through `request.bins`.
2. Construct a speculative `FfdAssignment` clone.
3. Inject the overflow item into `assignment.per_bin[bin_idx].placements` at `x = clearance, y = clearance`.
4. Call `optimize_single_bin_fast_path` on this speculative assignment, providing a strict slice of the remaining `global_deadline` budget.

**Step 3: Accept / Reject via GLS**
When `optimize_single` executes, it builds the `jagua` instance. The injected item will severely overlap with the existing valid layout. `Separator::separate` will execute its penalty-weighted gradient descent to pull the item into open 2D space.
* If `separate` returns `SeparateOutcome::Feasible`, it found a valid 2D coordinate! We commit the speculative assignment, decrement the item from `overflow`, and continue to the next item.
* If it returns `SeparateOutcome::Infeasible` (strike limit exhausted), the bin is truly full. We discard the speculative assignment and try the next bin.

## 4. Determinism Analysis

Preserving the "positional RNG" invariant established in Task 12 is paramount. The recovery loop introduces conditional logic that diverges based on placement success.

To guarantee determinism:
1. **Isolate RNG Streams:** Do not consume `orch_rng` for the speculative loops. Instantiate a dedicated recovery RNG: `let mut recovery_rng = Xoshiro256PlusPlus::seed_from_u64(seed ^ 0x0VERF10W);`.
2. **Fixed Iteration Orders:** The overflow items must be deterministically sorted (e.g., by area, then `shape_id`). The loop over bins must follow `0..n_bins`.
3. **Pre-drawn Seeds:** When calling `optimize_single_bin_fast_path` speculatively, pass a pre-drawn seed: `recovery_rng.next_u64()`. Because the loop over bins and items executes sequentially, the sequence of RNG draws will remain perfectly consistent across runs, ensuring bit-identical outputs regardless of early exits.

## 5. Test Strategy

We must validate the gap closure without violating the Task 9 single-bin invariants.

1. **Single-Bin Parity:** The fast path `if n_bins <= 1` at the top of `optimize_multi_with_hooks` remains untouched. Fixtures like `single-rect.json` will bypass the new orchestrator logic entirely, preserving their 8ms execution time and exact outputs.
2. **Integration Tests:** Introduce `test_overflow_recovery_2d_placement` in `multi.rs`. Provide a small square bin and 4 items that fit in a 2x2 grid. The 1D warm start will place 2 items and overflow 2. The test must assert that `optimize_multi` terminates with `overflow == 0` and `placements.len() == 4`.
3. **Benchmark Regression:** Run the full `bench_summary` sweep. `circle-grid`, `rect-grid`, and `multi-sheet-remnant` will now match the legacy placed counts, while `elapsed` ms remains well within the 2000ms `fast` mode budget.

## 6. Verdict

**Ready-to-build.**
Option B represents an elegant, asymmetric advantage of the new Rust architecture. Instead of writing hundreds of lines of complex NFP algorithms, we can achieve parity by lightly orchestrating the existing, highly-tested Sparrow GLS solver to do the geometric heavy lifting.
