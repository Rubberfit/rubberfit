# Task 12 research — FFD + swap orchestrator (Codex voice)

## Context

REMA Portal Rust nesting engine, phase S2.5b. Branch `refactor/rf-engine`,
HEAD = `0149faa` (Task 11 shipped: swap/migrate/unload operators as
single-shot pure functions on `FfdAssignment`).

Task 12 integrates those operators INTO the search loop so the
orchestrator can refine bin assignments mid-optimization, not just at
the start.

Gemini is writing a design report in parallel at
`.claude/research/task12/gemini-report.md`. You write
`.claude/research/task12/codex-report.md` as the implementation-focused
second opinion — anticipate the sharp edges, scan for correctness
invariants Gemini might miss, flag anything that will bite during impl.

## Parent plan Task 12 spec

1. `search::optimize_multi(request, seeds, cfg) -> Result<Vec<SeedResult>>`.
2. `pack.rs` calls `optimize_multi` once per request (not per-bin loop).
3. Per-bin budget internal to `optimize_multi`.
4. Swap operators run every K iterations (K default 50).
5. Update all parity snapshots.
6. Commit.

## Your key implementation questions

1. **State translation cost.** Converting between `Layout` (sparrow's
   mutable state) and `FfdAssignment` (our count-based assignment) every
   K iterations — how expensive? Can we avoid full re-replay by passing
   Layout snapshots directly into operators? Or does the strict
   duplicate-shape-id invariant from `replay_seed_into_layout` force us
   to always go through `materialize_parts`?

2. **Cardinality preservation across operator boundary.** Task 5-8's
   Separator preserves placed cardinality (separator.rs:390). Task 11's
   operators preserve global cardinality via count-based state.
   What breaks if we translate Layout → FfdAssignment → operator →
   FfdAssignment → Layout? Enumerate failure modes: lost items, moved
   items in mid-flight, `instance_index` renumbering, RNG-state
   divergence.

3. **Restart semantics for Separators.** After operators mutate bin
   assignments, do we destroy all Separators and build fresh ones on
   the new `SeedResults`? Or hot-swap their internal `Layout` while
   preserving CollisionTracker state? Hot-swap is faster but more
   error-prone.

4. **Time budget accounting under cross-bin operators.** Per-bin
   Separator budget today is `total / n_bins`. After an operator call,
   which may take 1-500ms, who accounts for that time? If we split
   budgets evenly pre-operators, a swap-heavy run under-spends on
   GLS; if we split dynamically, reproducibility under fixed seed
   suffers.

5. **Iteration counter.** "Every K iterations" — whose iteration
   counter? Each Separator has its own; do we use global tick count
   (operator runs when sum of per-bin iterations hits K*n)? Or per-bin
   (operator runs when ANY bin's counter hits K)?

6. **Ok(None) from operator.** If `unload_lightest_bin` returns
   `Ok(None)` (no improving move), do we skip operators for this tick
   and just let Separators run longer? Or try a different operator?
   Recommend exponential back-off on fruitless operator ticks.

7. **pack.rs integration.** The existing pack.rs has per-bin
   `placement accumulation + index counters`. With `optimize_multi`
   returning Vec<SeedResult>, pack.rs becomes a thin aggregator.
   Walk through what stays and what goes. What changes to
   `PackResult` construction?

8. **Error propagation.** What happens if one bin's Separator returns
   `Err(PackError::EngineFailed)`? Does `optimize_multi` propagate
   immediately or try to recover (e.g., use pre-operator assignment)?

9. **Parity regressions.** Task 9 tests: do they need fixture updates?
   What specifically might break? (e.g., `property_deterministic_under_seed`
   — does the new multi-bin scheduling change placement order?)

10. **Integration test matrix.** What new tests does Task 13 need that
    Task 12 should support from the orchestrator side? Spec the
    test hooks.

## Deliverable

`.claude/research/task12/codex-report.md`. ~1200-2000 words.

Structure:
1. Executive summary (50 words): approve/needs-revision verdict
2. State translation — cost analysis + recommended cadence
3. Separator restart semantics
4. Budget accounting formula
5. Iteration counter (global vs per-bin)
6. Operator exhaustion back-off
7. pack.rs refactor scope
8. Error propagation + rollback
9. Parity risk assessment
10. Sharp edges / gotchas (numbered list of 8+)
11. Verdict

Implementation-focused — light on motivation, heavy on "if you don't
handle X, impl will break."

## Files to read first

Same as Gemini. In particular:
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` —
  `optimize()`, `replay_seed_into_layout` + its preconditions.
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs`
  — Separator's per-iteration loop + Layout mutation points.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
  — operator APIs + return types.
- `engine/crates/rema-layout/src/application/pack.rs` — current loop.

Do not modify any code.
