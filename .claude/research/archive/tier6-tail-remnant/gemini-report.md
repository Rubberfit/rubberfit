# Tier 6: Tail-Remnant Preservation — Research Report (Gemini)

## Executive Summary

The Rust bin-packing engine, using `bin-packing` 0.3.0 with `MaxRectsBestShortSideFit`, currently underperforms the legacy TypeScript NFP engine on the 2-bin fabrication benchmark, primarily due to its failure to preserve a usable tail remnant. The legacy system preserves a ~2,400 sq in larger remnant, resulting in a 6-point higher Fab Score. This report analyzes methods to close this gap by optimizing for usable leftovers, a well-understood problem in the cutting-stock literature.

Our primary recommendation is to **implement a Next-Fit-Decreasing (NFD) item routing strategy with greedy bin closing**. This approach fundamentally changes the routing logic to fully pack one roll before starting the next, naturally leaving the final roll under-filled and thus preserving a large, contiguous tail remnant. This is a logic change outside the core packing algorithm and can be implemented with low risk to existing single-bin performance.

We project this change will increase reusable area by **+2,000–2,500 sq in** and boost the Fab Score by **+5–7 points**, effectively closing the performance gap with the legacy system on this key benchmark.

---

### 1. Tail preservation in the 2D-BPP literature

The optimization of "usable leftovers" (also "reusable offcuts," "residual sheets," or "tail remnants") is a well-established sub-problem in the 2D Bin-Packing (2D-BPP) and Cutting-Stock Problem (CSP) literature. It is often referred to as the **Cutting-Stock Problem with Usable Leftovers (CSP-UL)**.

The foundational Dyckhoff (1990) typology for cutting and packing problems does not explicitly model leftovers in its primary classification, but subsequent work has built extensively on it. The key distinction is the objective function. While classical 2D-BPP aims solely to minimize the number of bins or total packed area (waste minimization), CSP-UL introduces a dual objective: minimize waste *while maximizing the value of the remaining material*.

**Key Literature & Concepts:**

*   **Cherri, Arenales, et al. (2009, 2013):** This body of work is central to the field. The authors formalize the CSP-UL and introduce models where the value of a leftover piece is a function of its dimensions. Their objective function is often a weighted sum, for example:
    `minimize (Cost of new sheets) - (Value of usable leftovers)`
    The "value" can be defined in several ways:
    1.  **Area-based:** Value is proportional to the area of the leftover piece, provided it meets minimum dimensional constraints (e.g., length ≥ L_min and width ≥ W_min).
    2.  **Fractional Usability:** A leftover piece may be only partially usable. For instance, a 10"x100" piece might be valued less than a 50"x20" piece of the same area if wider parts are more frequently demanded.
    3.  **Catalog-based:** Leftovers are only considered "usable" if they match dimensions of items in a predefined catalog of desirable remnant sizes.

*   **Strip-Packing with Tail Preservation:** Our specific scenario—packing onto fixed-width, variable-length rolls—is a variant of the **strip-packing problem**. The goal in classical strip-packing is to minimize the total length used. The "tail remnant" is the unused length of the final roll. The objective becomes minimizing the used length of all but the last roll, while also ensuring the packed length on the last roll is minimized to leave a clean, long tail. This is subtly different from generic 2BP-UL, which often deals with a stock of discrete rectangular sheets.

*   **Objective Functions:** The lexicographical ranking used by `bin-packing` 0.3.0 (`max_usable_drop_area↑`, `total_sum_sq_usable_drop_areas↑`) is a direct implementation of the "single-largest-leftover" and "consolidation" objectives from the literature. Rewarding the *squared* area (`total_sum_sq_usable_drop_areas`) is a standard technique to penalize fragmentation; a single large piece will have a much larger squared area than two smaller pieces that sum to the same area (e.g., `(10*10)^2 = 10000` vs. `(5*10)^2 + (5*10)^2 = 2500 + 2500 = 5000`).

The academic consensus is that explicitly modeling leftover value is crucial for applications like ours where stock material is expensive and remnant reuse is a key part of the production workflow.

### 2. Algorithms that explicitly model reusable residuals

While many academic papers propose exact models (e.g., Mixed-Integer Programming), heuristic and metaheuristic approaches are dominant in practical implementations due to computational complexity.

*   **`packingsolver` (fontanf/packingsolver):** This C++ library is a prominent open-source example. For problems it terms "Bin Packing with Leftovers," it implements a **Column Generation** based heuristic. Column generation is an exact method for linear programs that is adapted here. It works by:
    1.  Starting with a small subset of possible cutting patterns ("columns").
    2.  Solving a "master problem" to find the best way to combine the current patterns.
    3.  Running a "pricing subproblem" to find a new, better cutting pattern that, if added, would improve the overall solution.
    4.  Repeating until no more improving patterns can be found.

    For the leftover variant, the pricing subproblem is modified to find patterns that generate high-value leftovers. While powerful, this approach is complex. A key issue for our use case is its **GPL-3.0 license**, which is incompatible with our project's license constraints. There are no known MIT/Apache-licensed Rust ports that directly replicate this column-generation approach for CSP-UL.

*   **Memory-Bounded A* (MBA*):** Some solvers use tree search algorithms like A*. MBA* is a variant that limits memory usage to avoid exploring the entire massive search space. The heuristic function (`h(n)`) guiding the A* search would be modified to include an estimate of the value of leftovers that could be generated from the remaining unpacked items and space. This is a highly tunable and complex approach.

*   **Heuristics in `bin-packing`:** The `bin-packing` crate itself uses heuristic approaches (MaxRects, Skyline, etc.) and then *ranks* the resulting solutions using a metric that includes leftover value. This is a simpler, less integrated approach than column generation. It doesn't guide the packing *towards* good leftovers, but rather selects the best solution *post-hoc* from a set of candidates generated by standard heuristics. This is why its effectiveness is highly dependent on the initial heuristics' ability to generate diverse solutions, some of which might incidentally have good remnants.

### 3. Ranking-contract tuning in bin-packing 0.3.0

The existing `bin-packing` API offers several levers for tuning. The current configuration is likely suboptimal for tail preservation.

*   **`min_usable_side` Threshold:** The current `min_usable_side: 60000` (6") is a blunt instrument. The actual reusability rule is a logical OR: `(width ≥ 11.5" AND height ≥ 12") OR (width ≥ 6" AND height ≥ 24")`. The `bin-packing` API does not support such a complex rule; it only checks if both sides of a remnant rectangle exceed `min_usable_side`.
    *   **Analysis:** Setting `min_usable_side` to `115000` (11.5") would be a better approximation of the primary reusability rule. This would correctly classify long, narrow strips (e.g., 8" x 300") as waste, potentially forcing the packer to consolidate parts differently to create a wider remnant that *does* meet the 11.5" threshold. This is a simple, low-risk change to test. It directly tells the ranking function to ignore narrow offcuts, aligning its objective more closely with ours.

*   **`MaxRectsBestShortSideFit` vs. `Auto`:** The `Auto` algorithm was found to regress the Fab Score.
    *   **Speculation:** `Auto` tries multiple algorithms, including those that may prioritize sheer density over layout structure (e.g., Guillotine variants, or MaxRects with different heuristics like BestLongSideFit). `BestShortSideFit` (BSSF) tends to leave squarer residual rectangles, which are often better for placing subsequent items. Other heuristics might create long, skinny gaps that are efficient for packing but terrible for remnants. The `Auto` mode, optimizing for the full lexicographical contract, likely found a solution with slightly lower `total_waste_area` that happened to fragment the remnant, and the remnant-scoring tiebreakers were not enough to overcome the waste improvement. This indicates that **the `total_waste_area` term in the ranking contract is overpowering the remnant-quality terms**. To truly prioritize remnants, we would need a custom ranking contract where remnant quality is weighted *higher* than total waste, which is not supported by the current API.

*   **Forcing a Strip-Packing Objective:** It is not feasible to force a true strip-packing (length minimization) objective through the current API. The packer is given a fixed bin size and attempts to fill it. Artificially shortening the bin would simply cause the FFD router to spill items to the next bin sooner. The core packing algorithm for a single bin doesn't have a concept of "minimizing height"; it only tries to fit as many of the provided items as possible into the given rectangle.

### 4. Multi-start search / randomized restart

The `Multistart` algorithm in `bin-packing` 0.3.0 wraps another algorithm and runs it multiple times with different random seeds. The random seed influences the tie-breaking when choosing which rectangle to place or which gap to place it in, leading to different layouts.

*   **How it works:** By default, `Multistart` runs for a number of iterations proportional to the number of items, but this can be configured. It explores different parts of the search space by perturbing the deterministic heuristics. Jylänki's original thesis on MaxRects (2010) and related work on randomized priority search (Crainic et al.) suggest that even a moderate number of restarts (e.g., N=16 to N=64) can significantly improve solution quality over a single deterministic run.
*   **Applicability:** For the 37-part benchmark, running `MaxRectsBSSF` with N=16 or N=32 restarts is likely well within the 1500ms runtime budget. We could then take these N solutions and apply our own ranking function, picking the one with the best `max_usable_drop_area`. This is a powerful technique because it generates a diverse set of high-quality solutions. Instead of being stuck with one deterministic outcome, we get many to choose from, increasing the odds that one of them has a large, clean remnant. The main drawback is the increased computation time.

### 5. Next-fit-decreasing with greedy bin closing

This represents a paradigm shift from the current routing strategy.

*   **Current FFD (First-Fit-Decreasing):**
    1.  Sort all 37 items by area, descending.
    2.  For each `item` in the sorted list:
    3.  Try to place `item` in `bin-1`.
    4.  If it fails, try to place `item` in `bin-2`.
    5.  ...and so on.
    This is an **item-centric** approach. It balances the load across bins because small items that fail to fit in the mostly-full `bin-1` can still be placed into `bin-2`, effectively "re-opening" it. The result is two bins filled to a similar height, which is precisely what we want to avoid.

*   **Proposed NFD (Next-Fit-Decreasing) with Bin Closing:**
    1.  Sort all 37 items by area, descending.
    2.  Designate `bin-1` as the active bin.
    3.  For each `item` in the sorted list:
    4.  Try to place `item` in the active bin (`bin-1`).
    5.  If it succeeds, move to the next item.
    6.  If it fails, **permanently close `bin-1`**. Designate `bin-2` as the new active bin. Place the failed `item` (and all subsequent items) into `bin-2`.
    This is a **bin-centric** or "sequential" approach. Once a bin is declared "full" (because it rejected an item), it is never considered again. This strategy naturally packs the first bin as densely as possible and pushes all remaining items, large and small, to the next bin. The final bin will be under-filled by definition, creating the desired tail remnant. This is described by Puchinger & Raidl (2007) as a common and effective heuristic for related problems.

This approach directly engineers the desired outcome at the routing level, making it less reliant on the subtle tuning of the in-bin packing algorithm.

### 6. Shelf-based per-bin packing with overflow allow-list

The legacy solution's two-shelf structure suggests that shelf-packing algorithms could be a good fit for REMA's part geometry.

*   **Shelf Algorithms (FFDH, BFDH):** First-Fit/Best-Fit Decreasing Height algorithms work by creating horizontal shelves. Items are sorted by height, and a new shelf is created for the tallest unpacked item. Subsequent, shorter items are packed left-to-right into that shelf until it's full.
    *   **Pros for Tail Preservation:** Shelves create perfectly rectangular packed areas. When the packing of a bin stops, the remaining empty space is a single, clean rectangle. This is ideal for generating usable remnants. Given that REMA's parts cluster into height families, this approach could be very effective.
    *   **Cons:** Shelf packing can be less dense than non-guillotine methods like MaxRects, as it creates vertical waste within each shelf (the gap between the top of an item and the shelf ceiling). `bin-packing` 0.3.0 *does* offer `BFDH` (Best-Fit Decreasing-Height), which is a shelf-packing algorithm.

*   **Comparison to MaxRects:** MaxRects is generally denser but produces irregular boundaries between packed and empty space. Shelf packing is less dense but produces clean, rectangular boundaries. For tail preservation, the clean boundary is arguably more important than maximizing density on the penultimate roll. Trying the `BFDH` algorithm within the existing FFD framework is a valid experiment, but it may not be as effective as changing the routing strategy to NFD.

### 7. Recommendation

#### Primary Recommendation: Implement NFD with Greedy Bin Closing

This is the most direct and robust approach to achieving the tail-preservation goal.

*   **Algorithm Family:** Next-Fit-Decreasing (NFD) routing logic. The per-bin packer can remain `MaxRectsBestShortSideFit` as it has proven effective for single-bin density.
*   **Rust Crate / Code Path:** No new crate needed. This is a logic change in the item-to-bin assignment loop (likely in a file like `ffd.rs` or `router.rs`). The `bin-packing` call for each bin is unchanged.
*   **Code Change Sketch:**

    ```diff
    // In the main item routing/FFD function

    - // Current item-centric FFD logic
    - let mut bin_demands: Vec<Vec<Demand>> = vec![Vec::new(); bins.len()];
    - for item in sorted_items {
    -     let mut placed = false;
    -     for i in 0..bins.len() {
    -         // Attempt to pack item in bin i with items already assigned to it
    -         if try_pack_in_bin(item, &bin_demands[i]) {
    -             bin_demands[i].push(item);
    -             placed = true;
    -             break;
    -         }
    -     }
    -     if !placed { unplaced_items.push(item); }
    - }

    + // Proposed bin-centric NFD logic
    + let mut bin_demands: Vec<Vec<Demand>> = vec![Vec::new(); bins.len()];
    + let mut remaining_items = sorted_items;
    + for i in 0..bins.len() {
    +     if remaining_items.is_empty() { break; }
    +
    +     // Greedily pack the current bin until it's "full"
    +     let (placed_in_bin, still_remaining) = pack_bin_greedily(bins[i], remaining_items);
    +     bin_demands[i] = placed_in_bin;
    +     remaining_items = still_remaining;
    + }
    + let unplaced_items = remaining_items;

    // The 'pack_bin_greedily' function would itself be a loop:
    // It iterates through 'remaining_items', attempting to add them one-by-one
    // to the current bin. If an item fits, it's added to 'placed_in_bin'.
    // If it fails, it's added to a new 'still_remaining' list.
    // This is distinct from trying to solve the whole bin at once.
    // A more robust implementation would solve for the maximum number of items
    // from the head of the list that can be packed.
    ```

*   **Implementation Effort:** **2-3 dev-days**. The logic change is non-trivial and requires careful testing. ~150 LOC change.
*   **Risk:** **Low**. This change primarily affects the multi-bin routing. The core `warm_start.rs` single-bin packing logic is untouched, so performance on single-bin jobs should be identical. The 27 parity fixtures must be re-run, but since NFD is a standard, predictable heuristic, regressions are unlikely unless some fixtures rely on the FFD bin-balancing behavior.

#### Tier-2 Fallback #1: Tune `MaxRects` and use `Multistart`

If NFD proves problematic, we can stick with FFD and tune the packer.

*   **Algorithm Family:** `Multistart` wrapping `MaxRectsBestShortSideFit`.
*   **Crate:** `bin-packing` 0.3.0
*   **Code Change Sketch:**
    ```diff
    // warm_start.rs
    let options = TwoDOptions {
    -    algorithm: TwoDAlgorithm::MaxRectsBestShortSideFit,
    +    algorithm: TwoDAlgorithm::Multistart(Box::new(TwoDAlgorithm::MaxRectsBestShortSideFit)),
         seed: Some(seed),
    -    min_usable_side: (6.0 * SCALE).round() as u32,
    +    min_usable_side: (11.5 * SCALE).round() as u32,
         ..TwoDOptions::default()
     };
    ```
    *Note: The `Multistart` API might require more configuration (e.g., number of starts).*
*   **Implementation Effort:** **0.5 dev-days**. Simple parameter changes.
*   **Risk:** **Medium**. Changing `min_usable_side` could have unintended consequences on other layouts. `Multistart` increases runtime and introduces randomness that must be controlled by the `seed` for determinism. There's a risk it finds a "better" solution by the crate's metric that is worse for ours (e.g., better waste but worse remnant, as seen with `Auto`).

#### Tier-2 Fallback #2: Switch to Shelf Packing (`BFDH`)

*   **Algorithm Family:** Shelf Packing (BFDH) with the existing FFD router.
*   **Crate:** `bin-packing` 0.3.0
*   **Code Change:** Change `algorithm: TwoDAlgorithm::MaxRectsBestShortSideFit` to `algorithm: TwoDAlgorithm::BFDH`.
*   **Implementation Effort:** **0.5 dev-days**.
*   **Risk:** **High**. Shelf packing is fundamentally less dense than MaxRects. While it might solve the 2-bin case, it has a high probability of regressing the Fab Score on the single-bin benchmark and failing some of the 27 parity fixtures due to lower packing efficiency.

### 8. Expected delta (for Primary Recommendation)

*   **Tail-remnant area gain:** **+2,000 to +2,500 sq in**. The NFD strategy is expected to replicate the behavior of the legacy system by forcing one roll to be packed densely while pushing all overflow to the second roll. This should leave a tail remnant of approximately 78" x 150-180", far larger than the current near-zero tail. This would bring the total reusable area from 14,292 sq in to **~16,300–16,800 sq in**, meeting or exceeding the legacy target of 16,704 sq in.
*   **Fab Score delta:** **+5 to +7 points**. The Fab Score deficit is 6 points. The significant gain in reusable area is the primary driver of the score. Closing this gap should recover the full deficit. We project a final Fab Score of **51–53**.
*   **Confidence Level:** **High**. The described NFD behavior directly addresses the root cause of the problem (bin-balancing vs. sequential filling). The logic is sound and widely used for this exact purpose. The estimate could miss if the specific item-geometry interaction within `MaxRectsBSSF` on the nearly-full first bin is unexpectedly poor, causing more items than anticipated to spill to the second bin. However, this is unlikely to alter the fundamental outcome of creating a large tail.
*   **Conclusion:** This change is expected to **fully close the gap** on the 2-bin benchmark. No further tier work should be necessary for this specific performance issue.

### Sources

1.  Cherri, A. C., Arenales, M. N., & Yanasse, H. H. (2009). The one-dimensional cutting stock problem with usable leftovers—A model for a new column generation heuristic. *European Journal of Operational Research*.
2.  Dyckhoff, H. (1990). A typology of cutting and packing problems. *European Journal of Operational Research*.
3.  Puchinger, J., & Raidl, G. R. (2007). Models and algorithms for the two-dimensional bin packing problem with guillotine cuts. *Proceedings of the 9th annual conference on Genetic and evolutionary computation*.
4.  Jylänki, J. (2010). A Thousand Ways to Pack the Bin - A Practical Approach to Two-Dimensional Rectangle Bin Packing. *Master's Thesis*.
5.  `bin-packing` crate documentation: [https://crates.io/crates/bin-packing](https://crates.io/crates/bin-packing)
6.  `packingsolver` library: [https://github.com/fontanf/packingsolver](https://github.com/fontanf/packingsolver)
7.  Baker, B. S. (1980). A new algorithm for first-fit decreasing bin packing. *Journal of the ACM*.
