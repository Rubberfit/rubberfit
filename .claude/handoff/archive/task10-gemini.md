# Task 10 design — Gemini deep-read

## Context

S2.5a is materially complete (Tasks 5-9 shipped). S2.5b now starts. Task 10 is the first S2.5b task.

Parent plan (Task 10, lines 125-138):

> ### Task 10: FFD bin assignment
> **Files:** `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`
>
> Context: today `pack.rs` iterates bins in input order with greedy spillover. We replace this with area-decreasing FFD to get better initial assignment.
>
> Steps:
> 1. Sort items by bbox area desc (configurable: longest-edge desc, aspect-aware).
> 2. For each item, try bins in order; place in first-fit using warm-start greedy.
> 3. Items that don't fit anywhere → overflow.
> 4. Tests: three items + two bins where naive order overflows but FFD doesn't.
> 5. Commit: `feat(search): FFD bin-assignment heuristic`

## Current state

Relevant files:
- `engine/crates/rema-layout/src/application/pack.rs` — the per-bin iteration (line 24-75 area). Current behaviour: iterate bins in input order, warm-start-greedy per bin, accumulate placements, track overflow.
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — `greedy_bottom_left(bin, items, clearance) -> SeedResult`. Stacks items vertically, overflows what doesn't fit.
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` — per-bin optimize; takes `bin` + `items` in `OptimizerConfig`.

Relevant literature: FFD (First-Fit-Decreasing) is the canonical heuristic for 1D bin packing, proven 11/9 OPT + 6/9 for classical BP. 2D extensions include FFDH (First-Fit-Decreasing-Height) and BFD (Best-Fit-Decreasing). Martinez-Sykora 2017 "jostle" uses variants. Cai 2023 uses bbox area desc with a block-building post-step.

## Your assignment

Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task10/gemini-report.md` covering:

1. **Module placement.** Parent plan says `infrastructure/search/assignment/ffd.rs`. That's a new `assignment/` submodule under `search/`. Is this the right home? Alternatives: top-level `infrastructure/assignment/` (not under search), inside `application::pack` (higher up), new crate. Justify.

2. **FFD variant.** Parent plan: "area-decreasing." Canonical 2D-FFD variants:
   - area desc (plan's default)
   - longest-edge desc (better for skinny rects)
   - aspect-aware (separate bins for tall vs wide)
   - hybrid: first by area bucket, then by aspect
   
   Pick one for the initial commit. Argue from the REMA fixture set (rolls are typically tall/thin or wide/short — skinny rectangles dominate). What's in `engine/crates/rema-layout/tests/fixtures/`? Do the fixtures suggest a specific sort order?

3. **Integration with warm_start.** The current `warm_start::greedy_bottom_left(bin, items, clearance)` takes items and handles them in list order. FFD needs to:
   - Sort items by area desc (or chosen metric)
   - Try each item against each bin in order
   - Place in first bin where it fits
   - Items that don't fit any bin → overflow
   
   Should FFD wrap `warm_start::greedy_bottom_left` per-bin (thin orchestrator), or replace it entirely with a single multi-bin assignment loop? Consider quantity-handling: a `Part` has `quantity: u32`, so FFD sees N copies of the same shape.

4. **API shape.** Propose the module's public entry point:
   ```rust
   pub fn ffd_assign(
       bins: &[Bin],
       items: &[Part],
       clearance: f64,
   ) -> Result<FfdAssignment, PackError>;
   ```
   Where `FfdAssignment` carries per-bin `SeedResult` + total overflow. Or is a different shape better?

5. **Integration with pack.rs.** Parent plan says `pack.rs` iterates bins in input order. After Task 10, does pack.rs call `ffd_assign` once instead of the per-bin loop? Or does FFD live as a different entry point, leaving the pack loop as fallback? Propose the cleanest wiring.

6. **Bin ordering.** FFD tries bins "in order" — but in what order? Input order? Sorted by capacity desc (bigger bins first)? Sorted by priority (REMA has `bin.priority: Option<u32>`)? Argue from the REMA domain — operators often prioritize specific remnants.

7. **Clearance handling.** Current warm_start passes `clearance` through. How does FFD's "try to fit" check handle clearance? Simplest: reuse warm_start's greedy per-bin and check if the Nth item fit before the overflow threshold. More sophisticated: precompute bbox-plus-clearance bounds.

8. **Determinism.** FFD must be deterministic: same inputs produce same assignment. Be explicit about tie-breaking when two items have the same bbox area.

9. **Tests.** Parent plan: "three items + two bins where naive order overflows but FFD doesn't." Propose 4-6 unit tests:
   - classic "naive overflows, FFD doesn't" case
   - tie-breaking determinism
   - single-bin case (FFD collapses to warm_start)
   - overflow when literally nothing fits
   - quantity-handling (Part.quantity > 1)
   - bin priority respected (if we decide to support it)

10. **Deviations list** for the file header. Same format as separator/explore/compress deviation blocks.

## Output

Markdown at path above. ≤2500 words. Concrete with file:line refs. No source edits.
