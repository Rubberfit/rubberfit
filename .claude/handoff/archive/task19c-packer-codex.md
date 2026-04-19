# Task 19c packer crate evaluation — Codex

## Context

REMA Portal Rust nesting engine, post-S2.5. Benchmark on real production cut list (29 parts, 2× 78"×396" rolls) showed:

- **Rust: 8/37 placed, 44% density.**
- **Legacy TS: 37/37 placed, 70.5% density (theoretical max), 27.2% reusable offcut, 2.3% waste.**

Root cause: `warm_start::greedy_bottom_left` falls back to a 1D vertical stacker when `items.len() > 1`. Task 19a's 2D grid packer only handles homogeneous single-part cases. Real heterogeneous cut lists hit the stacker, which places everything at x=0 and wastes half the roll width.

User does NOT want to write another packer from scratch — they spent 2 months on the TS version and it was buggy. They explicitly asked for open-source Rust crates we can use instead.

## Initial recommendation (Claude's pick, for your strict review)

**`guillotiere`** (MIT/Apache, Mozilla, Firefox-production-grade) as the Task 19c warm_start replacement.

Why Claude likes it:
1. Guillotine cuts match physical fabric-cutting semantics (all cuts are straight full-sheet passes).
2. Free-rect list exposed — gives us Task 19d's reusable-offcut analysis basically for free.
3. Rotation supported.
4. Integer coords — we already scale f64 → i32 via `RemaScale` elsewhere.
5. ~80 LOC of integration vs ~300 LOC of hand-rolled shelf packer.

Alternative: `rectangle-pack` (chinedufn) — MAXRECTS + skyline heuristics, multi-bin, pure Rust no FFI. Slightly more code to wire.

## Your assignment

Write `.claude/research/task19c-packer/codex-report.md` as an **implementation-focused second opinion**. Strict — this decides whether we live with a third-party packer in our production pipeline for years.

Questions:

1. **Is guillotiere actually production-ready for our case?**
   - It was built for sprite/texture atlases (small rects into a medium area).
   - Our case is medium rects (10-150" dimensions) into LARGE bins (78"×396" scaled to i32 — 780,000 × 3,960,000 at 10,000× fixed-point).
   - Does that scale blow out i32 precision, overflow internal arithmetic, or slow it down?
   - What's its performance characteristic — O(N) allocation? Are there pathological cases?

2. **Guillotine-cut constraint.** Fabric cutting IS guillotine-native (you can't do L-shapes with a knife). Claim: guillotine packers may pack LESS densely than free-2D packers, but match physical reality. Agree/disagree? Any failure mode where guillotine constraint costs us >5% density vs free-2D that we can't afford?

3. **Offcut analysis via guillotiere's free-rect list.**
   - Does guillotiere actually expose this publicly? Look at its API.
   - Are the free rects MAXIMAL (we want the biggest contiguous rectangles, not fragmented ones)?
   - Is the free-rect set deterministic under fixed-seed reruns? (Our S2.5 pipeline is seed-deterministic; this must stay intact.)

4. **Rectangle-pack alternative.**
   - Multi-bin out of the box — guillotiere is single-bin, we'd wrap it in our own multi-bin coordinator.
   - How does rectangle-pack's MAXRECTS output compare to legacy's 70.5% density target?
   - Licensing + maintenance status — is it actively maintained?

5. **Other crates I missed.** Rust ecosystem 2D packing: `crunch-rs`, `etagere`, `texture_packer`, `image_atlas`, `binpack`, `sheet_cut`, anything else?

6. **Commercial/academic packers we could vendor** (like we vendored sparrow's GLS in S2.5). Are there any Apache/MIT-licensed 2D BPP solvers we could port or extract a subset of?

7. **Integration with existing pipeline.**
   - `warm_start::greedy_bottom_left` is called by: (a) Task 10 FFD as a fit oracle, (b) initial seed generator for GLS, (c) Task 11 cross_bin_swap operators as a fit probe.
   - If we replace the warm_start with a guillotiere-based implementation, do downstream GLS + operators still work? Or does changing the seed shape break sparrow's GLS assumptions?

8. **Determinism.** Our pipeline is bit-deterministic under fixed seed (verified in Task 14). Does guillotiere's allocation strategy maintain deterministic output for the same input? (Claimed yes, but please verify.)

9. **The task 19c/19d split.**
   - 19c (Claude's proposal): wire guillotiere into warm_start. ~80 LOC.
   - 19d (Claude's proposal): use guillotiere's free-rect list for reusable-offcut metric in lex score. ~30 LOC.
   Is that sequencing correct, or should we fold them into one task?

10. **Verdict.** Go with guillotiere / go with rectangle-pack / hand-roll (rejected reasons) / something else.

## Deliverable

`.claude/research/task19c-packer/codex-report.md`, aim 1500-2500 words.

Structure:
1. Executive summary (50 words) — verdict + recommended crate.
2. Guillotiere deep-dive — production-ready for our case? scaling? determinism? API completeness for offcut analysis?
3. Rectangle-pack comparison.
4. Other crates surveyed + verdict.
5. Guillotine-cut analysis — is it a constraint or a feature for fabric?
6. Integration impact on existing Task 10/11/14 flow.
7. Task 19c/19d split recommendation.
8. Correctness-level sharp edges.
9. Verdict.

Be strict. Same level as your S2.5 Task 12 / 19 catches — those found real blockers before impl started. We need the same here.

Read:
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs`
- `engine/crates/rema-layout/src/infrastructure/search/assignment/{ffd,cross_bin_swap}.rs`
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs`
- `engine/crates/rema-geom/src/infrastructure/clipper.rs` (scaling pattern)
- `engine/crates/rema-layout/Cargo.toml`
- `tools/bench-production/bench.ts` (the benchmark that exposed the gap)

Do not modify code.
