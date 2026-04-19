# Tier 6: Tail-remnant preservation — research (Gemini)

## Context

Task 19d just landed: `bin-packing` 0.3.0 MaxRects BSSF replaces
`rectangle-pack`. Single-bin bench now beats legacy on Fab Score
(71 vs 57) and reusable area (4941 vs 4063 sq in). But 2-bin bench
still loses:

- Legacy preserves a **125.63" full-width tail on roll-2** (78"×178" remnant).
- Rust uses both rolls to ~full height, zero tail preserved.
- Fab Score 46 vs legacy 52 (−6).
- Reusable area 14292 vs legacy 16704 (−2412).

Root cause: FFD routes items independently, then each bin runs
bin-packing BSSF. Roll-1 is exhausted (396/396") with only 12 big
parts; remaining 25 spill to roll-2. Legacy's NFP approach seems to
stuff 33 parts onto roll-1 efficiently.

This is Tier 6 from the earlier research — highest ROI missing tier
per Codex's report.

## Your assignment

Web-research + recommend an algorithm for **tail-remnant preservation**
in Rust 2D bin packing. Deliverable:
`.claude/research/tier6-tail-remnant/gemini-report.md`, ~1500-2500 words.

### Required sections

1. **Tail preservation in the 2D-BPP literature.** Is this a known
   optimization target? Academic papers on "cut-plan with leftovers"
   / "residual sheet preservation" / "reuse-aware packing"?
2. **Algorithms that explicitly model reusable residuals.**
   `packingsolver` supports "bin packing with leftovers"; what
   algorithm does it use? Any Rust ports or reimplementations?
3. **Ranking-contract approach.** `bin-packing` 0.3.0's 2D ranking
   is `(unplaced, sheet_count, total_waste_area, total_cost,
   max_usable_drop_area↑, total_sum_sq_usable_drop_areas↑)`. The
   last two tiebreakers reward consolidation. Are we using them
   correctly (we set `min_usable_side = 60000` = 6")? Would tweaking
   help?
4. **Multi-start search / randomized restart.** Does running
   bin-packing's `multi_start` with N restarts find layouts with
   better tail preservation? At what N does quality plateau?
5. **"Next-fit-decreasing with greedy bin closing."** A classical
   approach: pack greedily into bin-1 until no more fit, then
   PERMANENTLY close bin-1 before opening bin-2. Does this differ
   from Rust's current FFD (per-item probes each bin)?
6. **Shelf-based per-bin packing with overflow allow-list.** Legacy's
   PDF shows a 2-shelf structure on roll-1 (G-family top, small parts
   bottom). Does shelf packing (FFDH/BFDH) with careful seam control
   beat MaxRects on REMA's specific geometry?
7. **Recommendation.** Which algorithm family + crate option gives
   the best expected improvement on the 2-bin benchmark?
8. **Expected delta.** Predict tail-remnant improvement and Fab Score
   delta under your recommendation.

### Constraints (same as Task 19d)

- Deterministic (same input → bit-identical output).
- Rust-native or stable Rust bindings.
- License MIT/Apache/BSD.
- Runtime budget: ≤ 1500ms for 37-part 2-bin job.
- Must not regress the 27 parity fixtures (`rust.placedCount >= legacy.placedCount`).

### Files to read

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current packer.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — routing.
- `tools/bench-production/bench.ts` — benchmark.
- `.claude/research/19d-packer-choice/gemini-report.md` — your earlier
  report on Rust packer ecosystem.
- `.claude/research/tiers-1-5/gemini-report.md` — your earlier Tier 6 mention.

No code changes. Report only.
