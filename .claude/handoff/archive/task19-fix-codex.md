# Task 19 fix research — close the rust-vs-legacy placement gap (Codex)

## Context

Branch `refactor/rf-engine`, HEAD `edd3410` (S2.5 Task 18). REMA
Portal Rust nesting engine is at 18/20 S2.5 tasks done, but
benchmark data exposed a real quality bug.

**The gap (verified from parity snapshots + bench sweep):**

| fixture                  | legacy placed | rust placed | gap |
|--------------------------|--------------:|------------:|----:|
| circle-grid.json         |            12 |           7 |  -5 |
| rect-grid.json           |            20 |          15 |  -5 |
| multi-sheet-remnant.json |            15 |          10 |  -5 |
| overflow.json            |             4 |           2 |  -2 |
| other 5 fixtures         |         equal |       equal |   0 |

**Root cause:**

1. `warm_start::greedy_bottom_left` is a pure vertical stacker (x=0,
   stack y). Items that don't fit the vertical column → overflow.
2. `Separator::separate` is cardinality-preserving (separator.rs:390).
   Overflow never gets re-seeded.

Legacy's NFP placer doesn't have this limitation; it iterates items
across the whole bin with rotation tries.

Gemini is doing research in parallel at
`.claude/research/task19-fix/gemini-report.md`. You write
`.claude/research/task19-fix/codex-report.md` — implementation-focused
second opinion. Flag the correctness traps and impl-level risks
Gemini will miss.

## Options on the table (Gemini is evaluating these — you stress-test)

- **Option A — 2D warm-start replacement.** Replace vertical stacker
  with a 2D greedy NFP. ~600 LOC in Rust; clipper2-rs available.
- **Option B — Iterative overflow re-seed.** Post-orchestrator loop
  that retries overflow items one by one. Minimal changes but
  expensive per retry.
- **Option C — Use jagua-rs's own constructive builder.** If
  `probs::bpp` exposes a 2D greedy, reuse it.
- **Option D — Port sparrow's own constructive (if better).**
- **Option E — Orchestrator-level retry.** After each round, probe
  overflow items against each bin for a fit.

## Your key implementation questions

1. **`Separator` cardinality invariant — can we relax it?**
   Task 5-8's port documents "cardinality preserved" at
   separator.rs:390. If we relax that to allow ADDING items during
   GLS (not just moving), what breaks? CollisionTracker sizes?
   Restart pool logic in explore.rs? Weighted-loss tracker keys?

2. **`replay_seed_into_layout` duplicate-shape_id precondition.**
   search/mod.rs:144 errors on duplicate shape_id rows in
   `config.items`. If we re-seed overflow items by adding them to
   an existing Layout via `layout.place_item()`, do we hit that
   precondition again or is it only enforced at replay time?

3. **Clipper2-rs NFP — actually available?**
   Verify we have `clipper2-rs` in the dependency graph with the
   polygon-Minkowski primitives we'd need for Option A. Check
   Cargo.toml and what jagua-rs pulls in transitively.

4. **Determinism under Option E (orchestrator retry).**
   A retry loop that probes overflow items against all bins has a
   scan order — which item first, which bin first. The Task 12
   positional-RNG invariant requires per-round determinism. How do
   we structure the retry to stay bit-identical under fixed seed?

5. **Option B's "expensive per retry" cost estimate.**
   `search::optimize` spins up a Separator + CollisionTracker.
   Running it 5+ times per fixture for each overflow item = how bad?
   Is the overhead dominated by Layout construction or by the GLS
   run itself?

6. **Multi-bin feasibility probing for retry.**
   If we retry overflow via `bin_fits(existing_counts + 1 extra
   item, bin)`, we reuse the Task 11 probe. But that's still the
   hardened `greedy_bottom_left` — same vertical-stack limitation
   that caused the original overflow. We'd need a BETTER probe
   (2D-aware) or we'd just confirm overflow all over again.

7. **Impact on Task 9's `gls_integration.rs` fixtures.**
   Those 5 tests validate single-bin GLS invariants. Which option
   risks regressing them? Option A would; Option B / E probably
   don't because they don't touch single-bin optimize.

8. **Bench re-run strategy.**
   If we ship Option B and the gap closes on 4 fixtures but opens
   elsewhere, Task 18's bench sweep is our validation. What's the
   minimum subset we need to re-run to verify the fix?

9. **Scope-limiting.** We're at 18/20 tasks in S2.5c with a Task 20
   tag at the end. What's the smallest change that closes ≥90% of
   the gap? The user wants a FIX, not an optimal 2D placer.

10. **Correctness risks per option.**
    Enumerate the most likely "ships with green tests but wrong in
    production" failure mode for each of A-E.

## Deliverable

`.claude/research/task19-fix/codex-report.md`, ~1200-2000 words.

Structure:
1. Executive summary (50 words): verdict + recommended option
2. Options A-E cost + risk analysis (impl-focused)
3. Specific implementation sketch for recommended option
4. Determinism traps
5. Correctness-level sharp edges (numbered list, 6+)
6. Test strategy
7. Minimum-scope vs optimal-scope split
8. Verdict: ready-to-build / needs-more-research / needs-revision

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs`
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs`
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
  (operator probe = `bin_fits` uses `greedy_bottom_left`)
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs`
  (`optimize()` + `replay_seed_into_layout`)
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs`
  (cardinality invariant)
- `engine/crates/rema-layout/Cargo.toml` (available deps)
- `nesting/nfp-greedy-placer.ts` (legacy 2D reference)
- `docs/superpowers/benchmarks/2026-04-18-s2.5-results.md`

Be strict. This is the research that decides whether we ship S2.5c
with a soft guard or a real fix.
