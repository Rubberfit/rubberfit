Attempt 1 failed: You have exhausted your capacity on this model. Your quota will reset after 1s.. Retrying after 5950ms...
I have completed the initial research across the codebase, available open-source crates, and the benchmarks provided. Here is a summary of my findings and my proposed strategy for the 5 tiers. 

Before I generate the full ~2500-3500 word `gemini-report.md` plan, I would like to confirm if you are aligned with this direction:

### **Proposed Strategy Summary**

**Tier 1: Reusable Offcut Maximization**
*   **Approach:** Expand the lex score in `cross_bin_swap.rs` from `(closed_bins, concentration)` to `(closed_bins, reusable_area, concentration)`. To calculate `reusable_area`, we can use `clipper2` (already wrapped in `rema-geom`) to compute the empty space polygon and find the Maximal Empty Rectangle (MER). 
*   **Crates:** `max_rects` is the strongest Rust crate for pure maximal empty rectangle tracking, though we can also compute it natively via a grid/sweep-line over the clipper boolean difference output.
*   **Threshold:** Should be configurable in `PackRequest` but default to the 11.5×12" or 6×24" criteria in `CLAUDE.md`.

**Tier 2: GLS refinement verification**
*   **Approach:** Introduce lightweight instrumentation into `multi.rs` and `bench.ts` to track if `optimize_single` (sparrow/GLS) or the cross-bin operators actually commit any moves on the 37-part heterogeneous production fixture. 
*   **Expected Finding:** S2.5 operators likely return `Ok(None)` because the current lex score is too coarse (only tracking total used area). By introducing Tier 1's `reusable_area` score, GLS will suddenly have the "headroom" to continuously improve layouts by shuffling parts to group the empty space.

**Tier 3: Rotation wrapper**
*   **Approach:** Since `rectangle-pack` 0.4.2 exposes rotation flags but leaves them unimplemented internally, we cannot rely on it to auto-rotate. Instead, we should implement a **heuristic pre-pass** before `greedy_rectangle_pack`: align the longest edge of every rotatable `Part` with the longest edge of the `TargetBin`, falling back to the natural orientation if one dimension exceeds bin bounds. 

**Tier 4: Fab Score as objective**
*   **Approach:** Without the exact legacy formula, 74/100 on a 70.5% density / 27.2% reusable job suggests the score heavily weights standard density + reusable remnant yield (perhaps simply `Density + Reusable Yield` factoring in some padding). We will reverse-engineer a surrogate `FabScore` and inject it as the paramount objective function in the GLS lex score.

**Tier 5: Pattern-family pre-pass**
*   **Approach:** Identify identical parts and merge their polygons into a single "macro-part" (e.g., a 3-column strip). 
*   **Risk:** Pre-grouping could conflict with `rectangle-pack`'s volume heuristic. 
*   **Recommendation:** Implement this strictly as a speculative pre-pass. Try packing with families; if it yields worse density or higher overflow, discard and fallback to the standard `greedy_rectangle_pack`.

**Ordering Recommendation:** 
I recommend executing **Tier 1 -> Tier 2 -> Tier 4 -> Tier 3 -> Tier 5**.
Tier 1 provides the scoring nuance needed to unblock Tier 2. Tier 4 standardizes the business metric, which Tiers 3 and 5 can then be measured against.

---
**Does this outline align with your expectations?** Once you confirm, I will draft the exhaustive `gemini-report.md` research plan into the plans directory.
