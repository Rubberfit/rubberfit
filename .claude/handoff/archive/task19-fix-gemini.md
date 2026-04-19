# Task 19 fix research — close the rust-vs-legacy placement gap (Gemini)

## Context

REMA Portal Rust nesting engine, phase S2.5c. Branch `refactor/rf-engine`,
HEAD = `edd3410` (Task 18 tuning shipped as null-result). 18/20 S2.5
tasks done.

**The problem.** Task 18's benchmark sweep + Task 16's snapshot
regeneration exposed a quality gap: on 4 of 9 parity fixtures, the
Rust engine places SUBSTANTIALLY FEWER items than the legacy TS
engine. Verified numbers (from current HEAD):

| fixture                    | legacy placed | rust placed | gap |
|----------------------------|---------------|-------------|-----|
| circle-grid.json           | 12            | 7           | -5  |
| rect-grid.json             | 20            | 15          | -5  |
| multi-sheet-remnant.json   | 15            | 10          | -5  |
| overflow.json              | 4             | 2           | -2  |
| (other 5 fixtures)         | equal         | equal       | 0   |

**Why.** Two interacting causes:

1. **`warm_start::greedy_bottom_left` is a vertical stacker.** It
   places items at `x=0`, stacking vertically. Items that don't fit
   the vertical stack go to `seed.overflow` and NEVER get placed —
   because...

2. **Sparrow's GLS pipeline doesn't re-seed overflow.** `Separator::
   separate` resolves collisions among ALREADY-placed items. It has
   no mechanism to add new items from an overflow list. The count is
   cardinality-preserving (documented at separator.rs:390).

So any item that `greedy_bottom_left` can't stack vertically is lost
to the Rust engine, even when the full bin has plenty of 2D space.
Legacy's NFP placer doesn't have this limitation — it iterates
items across the whole bin, trying rotations + 2D positions.

Task 18's tuning confirmed the operators (unload/migrate/swap) can't
recover either: they shuffle PLACED items between bins; they can't
grow the placed set.

## Parent plan Task 19 aspiration

> Replace S2-era "conservation only" guard with strict:
> `rust.placedCount >= legacy.placedCount`,
> `rust.overflowCount <= legacy.overflowCount`,
> `rustEff >= legEff - 0.005`.

That aspiration was correct but unmet today. The user rejected
shipping a soft-guard + "accept gap" framing and asked for a FIX.

## Your assignment — propose the fix

Write `.claude/research/task19-fix/gemini-report.md`. Design a change
that closes the gap. Options to evaluate:

### Option A — 2D warm-start replacement
Replace `greedy_bottom_left` with a 2D greedy NFP placer (like the
legacy TS implementation at `nesting/nfp-greedy-placer.ts`). Item
order: area-desc (same FFD sort). For each item, scan candidate
positions across the whole bin and pick the bottom-left-most fit.

**Pros:** delivers a strong seed; sparrow separates whatever it's given.
**Cons:** requires a full 2D placer implementation in Rust. ~600+ LOC.
Clipper2-rs (we already depend on it via jagua) has NFP primitives.

### Option B — Iterative overflow re-seed
After `optimize_multi` finishes, inspect `assignment.overflow`. For
each overflow item, try `optimize_single_bin_fast_path`-style retry
on each bin that has free space. Append successful placements to
the seed, decrement overflow, repeat until no more retries succeed.

**Pros:** minimal invasive — no change to GLS, no new placer.
**Cons:** re-runs `search::optimize` per retry = expensive per bin.
Retries can interact with the cross-bin operators.

### Option C — Use jagua-rs's own constructive builder
jagua-rs has constructive placement primitives (`probs::bpp` module).
We're already importing it. Their constructive path might have a
better 2D greedy than our vertical stacker.

**Pros:** reuses existing dependency. Minimal new code.
**Cons:** need to validate jagua's constructive output is
compatible with our downstream GLS + orchestrator. Also unclear if
it handles clearance the way we need.

### Option D — Port sparrow's OWN SPP constructive (if different)
Check sparrow upstream for a constructive seeder beyond what we've
ported. If they have a 2D placer that fits better with GLS than
greedy_bottom_left, port it.

### Option E — Fix at the orchestrator level
Change `optimize_multi` to iterate: after each round, if there are
overflow items AND at least one bin has free capacity, pick the
largest unplaced item and try an O(N×M) probe (all positions on
all bins) to find a fit. If found, promote to placed and continue.

**Pros:** conceptually clean — explicit retry loop.
**Cons:** can be slow on large fixtures; needs careful deterministic
scan order.

## Research questions

1. **Which option closes the gap for the 4 failing fixtures?**
   Pick one. If multiple work, rank by impl cost vs density gain.

2. **Implementation sketch:** ~200-400 word walkthrough of the
   recommended option. Include which files change, what the API
   looks like, how it integrates with the existing
   FFD → optimize_multi → operator ladder flow.

3. **Determinism:** any new scan orders or RNG consumption must
   preserve the positional-RNG determinism invariant from Task 12.

4. **Cost ceiling:** what's the expected wall-clock impact on the
   other 5 fixtures (which aren't affected by the gap)? We can't
   regress single-rect performance to fix circle-grid.

5. **Test strategy:** how do we verify the fix closes the gap WITHOUT
   breaking Task 9's parity tests?

## Deliverable

`.claude/research/task19-fix/gemini-report.md`, ~1500-2500 words.

Structure:
1. Root-cause confirmation (§Why above is correct?)
2. Option evaluation (A-E above; pros/cons/cost)
3. Recommendation with impl sketch
4. Determinism analysis
5. Test strategy
6. Verdict: ready-to-build / needs-more-research

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current
  vertical stacker.
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` — the
  orchestrator flow + operator ladder.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — FFD.
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` — `optimize()`
  entry + `replay_seed_into_layout`.
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` — why
  GLS can't add items (line 390 comment).
- `nesting/nfp-greedy-placer.ts` + `nesting/nfp-solver.ts` — legacy's 2D
  placer for reference if you propose Option A.
- `docs/superpowers/benchmarks/2026-04-18-s2.5-results.md` — Task 18
  findings.

Do not modify any code. Output only the report.
