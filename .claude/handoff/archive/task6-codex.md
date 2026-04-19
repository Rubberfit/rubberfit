# Task 6 second-opinion — Codex

## Context

S2.5 Task 5 (Separator port) shipped as commit `c59be2f` on `refactor/rf-engine`. Task 6 ports sparrow's `exploration_phase` (Algorithm 12) into `engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs`.

Upstream: `/tmp/sparrow-research/sparrow/src/optimizer/explore.rs` (240 LOC).
Task 5 output (already merged): `gls/separator.rs` — `Separator`, `SeparateOutcome::{Feasible, Infeasible{snapshot,ct_snapshot}}`, `Terminator`/`SolutionListener` traits + Noops.

A parallel Gemini researcher is writing `.claude/research/task6/gemini-report.md` covering architecture, BPP-analogue design, type map, disrupt port, pool mechanics, cancel/progress traits, config shape, budget wiring, tests, deviations, sequence check.

## Your assignment

Provide an independent second opinion focused on risks Gemini's design might miss. Write `.claude/research/task6/codex-report.md`.

Angles:

1. **Semantic break in the SPP→BPP loop.** Sparrow's `exploration_phase` has a feedback loop: feasible → shrink strip → retry. BPP has no shrink. What does "keep exploring" mean once feasibility is reached? If explore terminates on first feasibility, it's really just a one-shot separator wrapper with disrupt-on-failure. Is the plan's "best-feasible BPSolution tracking" meaningful in that design? Argue for either: (a) terminate on first feasibility (simpler, defensible since placed_count is fixed), or (b) keep separating post-feasibility to find a "better" layout under some objective (but what objective — minimum max-item-excess?). Ground your recommendation in what Task 8 (`search::optimize` wiring) and Task 12 (cross-bin swap) will consume.

2. **Disrupt-two-large correctness with BPP primitives.** `disrupt_solution` calls `sep.move_item(pk1, dt1_new)` which returns a new `PItemKey`. Our layout-scoped Separator inherited the same API shape. Check whether `practically_contained_items(&sep.layout, pk1)` correctly finds items contained by the post-swap shape (upstream reads after move). Any chance of a stale pk bug when 3+ swaps land in quick succession?

3. **`rand_distr::Normal` dep addition.** Is it gated behind a feature in sparrow's Cargo.toml? Does our `rand` 0.10 ecosystem pin `rand_distr` to a compatible version? Verify no breakage.

4. **`convert_sample_to_closest_feasible` availability.** Check `engine/crates/rema-layout/src/infrastructure/search/gls/uniform_sampler.rs` — is this helper already there (Task 4 ported uniform_sampler)? If so, what's its exact signature vs upstream?

5. **Infeasible pool ordering.** Sparrow sorts by `total_loss` ascending via `binary_search_by`. A bug here (wrong comparator) silently degrades quality. Verify the `partial_cmp(...).unwrap()` pattern ports cleanly and that `NaN` loss is impossible (if it is possible, propose how to guard).

6. **Budget split with compression.** Plan says explore takes 80% of budget. Task 7 (compress) takes the remaining 20%. Where does the split live — inside explore, inside Task 8 orchestrator, or via two pre-armed Terminators? Recommend the cleanest seam.

7. **Cancel timing.** Sparrow's explore loop polls `term.kill()` at the top of the outer while loop. For a Rust task with 10s budget, that means cancellation can take up to one `separate()` cycle (~100s of iterations). Is that acceptable for Task 14's UX target (<100ms cancel)? If not, propose adding a `term.kill()` check inside `move_items_multi` in a later patch.

8. **Determinism.** Sparrow seeds `Normal(0.0, stddev)` then samples with `.sample(&mut sep.rng)`. Our Separator's rng field is exposed publicly — confirm the explore loop can safely reuse `sep.rng` without stomping on the workers' independent RNGs.

9. **Config defaults.** Verify sparrow's `exploration()` defaults for `max_conseq_failed_attempts`, `solution_pool_distribution_stddev`, `large_item_ch_area_cutoff_percentile` — and whether any are `shrink_step`-related (and therefore drop).

10. **Known pitfalls.** Read sparrow paper §4 (Algorithm 12) and flag any invariant, tuning choice, or gotcha that isn't obvious from the code alone.

## Output

Report at the path above. Under 1500 words. If the Codex sandbox is read-only, print the full report so Claude can save it. Verdict: APPROVE for Claude to draft the plan / REJECT until more research is done. No code edits.
