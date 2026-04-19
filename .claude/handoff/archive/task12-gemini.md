# Task 12 research — FFD + swap orchestrator (Gemini voice)

## Context

REMA Portal Rust nesting engine migration, phase S2.5b. Branch
`refactor/rf-engine`, HEAD = `0149faa` (Task 11 shipped: cross-bin
swap operators).

**Where we are:**
- Task 10 shipped `ffd_assign()` — routes items to bins once up-front.
- Task 11 shipped `swap_two`, `migrate`, `unload_lightest_bin` —
  single-shot pure-function operators acting on `FfdAssignment`.
- Current `pack.rs`: calls `ffd_assign` once, then loops per bin
  calling `search::optimize` with each bin's FFD-routed subset.

**Task 12 goal:** weave the cross-bin operators INTO the search loop
so the orchestrator can refine the assignment mid-optimization.

## Parent plan Task 12 spec (verbatim)

```
### Task 12: Integrate FFD + swap into `search::optimize`

**Files:** engine/crates/rema-layout/src/infrastructure/search/mod.rs,
           engine/crates/rema-layout/src/application/pack.rs

Steps:
1. `search::optimize` now owns all bins, not one at a time. Signature changes:
   - `search::optimize_multi(request: &PackRequest, seeds: &[SeedResult], cfg: &OptimizerConfig) -> Result<Vec<SeedResult>>`
2. `pack.rs` calls `optimize_multi` once per request instead of looping per bin.
3. Per-bin budget internal to `search::optimize_multi` — it decides how to split.
4. Swap operators run every K iterations of the GLS outer loop (K tuned empirically, default 50).
5. Update all parity snapshots.
6. Commit: `feat(search): multi-bin coordination with cross-bin swap (S2.5b complete)`
```

## Your research questions

1. **Signature ergonomics.** Should it be `optimize_multi(request, seeds, cfg)` or
   `optimize_multi(assignment: FfdAssignment, request, cfg)`? Current `pack.rs`
   already calls `ffd_assign` to build the `FfdAssignment`. Passing it in vs
   having optimize_multi rebuild it.

2. **Call graph.** Where do operators slot in?
     a. `optimize_multi` sets up N per-bin Separators (reusing Task 5-8 code).
     b. Outer loop: every K iterations, pause all Separators, call
        `unload_lightest_bin` / `swap_two` on the current assignment, then
        restart Separators on the new assignment.
     c. OR: every K iterations, snapshot each bin's current state back into
        SeedPlacements, run operators, re-seed Separators.
   Recommend the cleanest approach.

3. **State translation.** Sparrow's Separator works on jagua `Layout` objects.
   Cross-bin operators work on `FfdAssignment` (count maps + SeedResults).
   How do we bidirectionally convert between Separator state and
   FfdAssignment mid-loop? Is there overhead per conversion we should
   minimize by snapshotting less often?

4. **Per-bin time budget.** Task 6/8 per-bin budget = total / n_bins.
   With operators running across bins, budget accounting changes.
   Options: (a) global wall-clock, (b) per-bin floor, (c) per-iteration
   accounting. Recommend.

5. **Progress/cancel hooks.** Task 14 adds progress+cancel. Task 12 should
   lay the groundwork — do we pass the cancel token into `optimize_multi`
   or leave that to Task 14? The `PackRequest` already has time_budget_ms
   but no cancel_token yet.

6. **K value (swap frequency).** Default 50 iterations. How do we validate
   this? Should it be tunable via `OptimizerConfig`? Per-bin or global
   iteration count?

7. **Operator call order.** `unload_lightest_bin` closes bins entirely;
   `swap_two` redistributes. Best order? (Typical: unload → swap → migrate.)

8. **Parity snapshot impact.** The parity test
   `tests/parity.rs::every_fixture_packs_without_error` runs the same 9
   fixtures Task 9 did. With Task 12, results CAN change (multi-bin
   orchestration may now pack different items to different bins).
   Recommend: how to rebaseline parity safely.

9. **Determinism.** The outer loop is deterministic (xoshiro seed).
   Cross-bin operators are deterministic. But scheduling (which bin's
   Separator runs first each tick) affects results. Recommend a strict
   round-robin schedule.

10. **Failure modes.** What if `unload_lightest_bin` returns `Ok(None)`
    for 10 iterations in a row? Do we stop trying operators, or keep
    polling? Recommend termination.

## Deliverable

`.claude/research/task12/gemini-report.md`. ~1500-2500 words.

Structure:
1. Signature recommendation (§1)
2. Call graph + state translation pattern (§2, §3)
3. Budget accounting (§4)
4. K value + tuning plan (§6, §7)
5. Parity rebaseline strategy (§8)
6. Determinism spec (§9)
7. Termination / operator exhaustion (§10)
8. Test scenarios (at least 8)
9. Verdict: approve / needs-revision

Aim to give me a design Claude can implement without further clarification.

## Files to read first

- `engine/crates/rema-layout/src/application/pack.rs` — current Task 10 call graph.
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` — `optimize()`,
  `OptimizerConfig`, `replay_seed_into_layout` (lines 138-270).
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` —
  Separator internals (the per-bin search driver we're integrating with).
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
  — the operators to weave in.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — state model.
- `engine/crates/rema-layout/tests/parity.rs` — what we must keep green.
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` lines 280-315 — Task 12 + 13 context.
- `docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md` — Task 11 plan for style.

Do not modify any code. Just write the report.
