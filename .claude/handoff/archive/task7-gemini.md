# Task 7 design — Gemini deep-read

## Context

S2.5 Task 6 (`exploration_phase` port) shipped as commit `2d01b09` on `refactor/rf-engine`. Task 7 ports sparrow's `compress.rs` (Algorithm 13) into `engine/crates/rema-layout/src/infrastructure/search/gls/compress.rs`.

Parent plan (Task 7 section, lines 99-109):
> Port sparrow's `compress.rs`. Fixed-container polish: try tighten + separate, accept improvements only.
> Budget: remaining 20% of `time_budget_ms`.
> Tests: compress never worsens density.
> Commit: `feat(search): compression phase (polish)`
>
> **Sub-step for task 8 (from code review of Tasks 1-3):** the final accept-reject decision in `compress` must consult `search::objective::BppObjective::is_better` on the assembled `SearchState`.

## The hard question

**Sparrow's compression_phase is SPP-specific.** Upstream `attempt_to_compress` at `/tmp/sparrow-research/sparrow/src/optimizer/compress.rs` does:

```
sep.change_strip_width(init.strip_width(), None);     // restore
sep.rollback(init_sol, None);
let new_width = init.strip_width() * (1.0 - r_shrink); // SHRINK THE STRIP
sep.change_strip_width(new_width, Some(split_pos));
let (compacted, ct) = sep.separate(term, sol_listener);
// accept iff ct.get_total_loss() == 0.0
```

The whole compression trick is "shrink the container → try to re-separate → if feasible, we compacted." BPP bins are FIXED. `change_strip_width` was deleted in Task 5. **There is no shrink analogue in BPP.**

Three possible interpretations of "BPP compression":

**(A) True no-op.** Compression is a strip-packing concept. For BPP with fixed bins, once items are non-overlapping, density is fixed. Skip compress entirely; return the exploration outcome unchanged. Lean, honest, matches BPP physics.

**(B) Geometric compaction — push items toward a corner.** Same item set, fixed bin, but rearrange to minimize the bounding box of placed items OR total distance from items to a designated corner. Leaves contiguous empty space in the opposite corner — useful for Task 12 cross-bin swap (which wants to relocate items between bins and benefits from having a large contiguous empty region).

**(C) GLS polish — more separate iterations with tighter criteria.** Run `Separator::separate` again with lower `strike_limit`, lower `solution_pool_distribution_stddev`, maybe narrower sampling. Accept-only-if-better via `BppObjective`. Reshapes the layout without changing density.

## Your assignment

Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task7/gemini-report.md` covering:

1. **Pick A, B, or C (or propose a D).** Ground your choice in: (i) what Task 8 (`search::optimize` orchestrator) will consume, (ii) what Task 12 (cross-bin swap) will want from a "polished" layout, (iii) how sparrow's paper (arXiv 2509.13329) frames compression, (iv) what minimal port earns its 20% budget slice. Argue, don't hedge.

2. **If A (no-op):** what does the module expose so Task 8 can still call `compression_phase(seed, ...)` without branching? A pass-through that just returns the input feasible layout?

3. **If B (geometric compaction):** define the objective (bounding-box area? centroid-to-corner distance?) concretely. Propose the algorithm (greedy-corner-push? a constrained separate() with a "gravity" bias in the sampler?). Budget: how does 20% of `time_budget_ms` get spent? How do we guarantee it never worsens the layout?

4. **If C (GLS polish):** what's the criterion function (BppObjective::is_better applied to a single-bin-equivalent SearchState — but we have just one bin, so the single-bin score collapses to what?). Tuning params: stddev multiplier, strike_limit halving, etc.

5. **`BppObjective::is_better` wiring.** Plan sub-step says compression's accept-reject must consult it. But BppObjective scores `SearchState` which is multi-bin; compress operates on a single `Layout`. Propose: lift the single-bin layout into a dummy `SearchState`, OR add a single-bin-friendly `is_better(&Layout, &Layout)` helper. Which is cleaner?

6. **File layout.** One new file `gls/compress.rs`. Also restore `SolutionListener::report_compress_improving` if needed (or reuse `report_feasible`).

7. **CompressionConfig shape.** Port sparrow's `CompressionConfig` (upstream `src/config.rs` L80+). Fields SPP-specific (`shrink_range`, `shrink_decay`, `time_limit`) either drop or adapt.

8. **Tests.** 4-5 unit tests demonstrating:
   - feasible seed in → compressed/same seed out (never worse)
   - respects terminator (short-circuit on kill)
   - deterministic under fixed seed
   - BppObjective tiebreak correctly applied

9. **Deviations list** for file header — same format as `explore.rs` and `separator.rs` deviation blocks.

10. **Sequence check.** What's new this task? What's retained from Tasks 3-6?

## Output

Markdown at the path above. ≤2500 words. Be concrete — line refs to sparrow, our merged `explore.rs`, `objective.rs`, `state.rs`. Be opinionated — "A, B, or C: pick one" is the critical question.

No code edits.
