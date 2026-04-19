# Task 6 design — Gemini deep-read

## Context

S2.5 Task 5 (Separator port) is now merged as `c59be2f`. Task 6 is the next task per `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` lines 75-97:

> ### Task 6: Exploration phase — penalty-weight loop
> **Files:** `engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs`
> Steps:
> 1. Port sparrow's `explore.rs` but replace `change_strip_width` (SPP) with a BPP objective driver:
>    - Track best-feasible `BPSolution`.
>    - Penalty weights update on stagnation (sparrow's recipe unchanged).
>    - Disrupt via swap-two-large on infeasibility (sparrow's "strike" move).
> 2. Accept a `cancel_token: &AtomicBool` + `progress_callback: &ProgressCallback` — no-op for S2.5a.
> 3. Budget: consume 80% of `time_budget_ms`.
> 4. Tests: single-bin fixture runs the explore loop, returns a better-or-equal solution than the warm-start seed.
> 5. Commit: `feat(search): exploration phase (GLS with penalty weights)`

Upstream: `/tmp/sparrow-research/sparrow/src/optimizer/explore.rs` (240 LOC).
Already-ported: `engine/crates/rema-layout/src/infrastructure/search/gls/{separator,sampling,sep_evaluator,tracker,...}.rs`.
Task 5 output at `gls/separator.rs`: `Separator`, `SeparatorWorker`, `SeparateOutcome::{Feasible, Infeasible{snapshot,ct_snapshot}}`, `SeparatorConfig`, `Terminator`/`SolutionListener` traits + Noop impls, 5 unit tests.

## Your assignment

Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task6/gemini-report.md` covering:

1. **BPP analogue of `exploration_phase`.** Sparrow's `exploration_phase` uses `change_strip_width(next_width)` after every successful separation to shrink the strip. BPP bins are fixed-size — no shrink. Propose the BPP loop structure. Key question: once the warm-start layout reaches feasibility, what *is* "continued exploration"? If all N items are already non-overlapping in the bin, the density for that bin is fixed. Does explore just terminate on first feasibility? Or does it keep running to find a *better* (denser? same density but different arrangement?) layout? Ground your answer in: (a) how `search::optimize` will call into explore from Task 8, (b) how Task 12's cross-bin swap will consume explore's output, (c) what the plan's "best-feasible BPSolution" tracking means in a fixed-bin world.

2. **Type map SPP→BPP for explore.rs.** List every SPP-specific type/function sparrow's `explore.rs` touches (`SPSolution`, `SPInstance`, `sep.prob.strip_width()`, `change_strip_width`, `density` on `SPSolution`) and specify the BPP / Layout equivalent. `sep` here has been retyped to wrap a single `Layout` (Task 5); verify that explore.rs can consume it without requiring BPProblem access.

3. **`disrupt_solution` port.** Sparrow's `disrupt_solution` (lines 89-216) uses `sep.prob.instance` and `sep.prob.layout`. Map those onto our layout-scoped Separator (`sep.instance: BPInstance`, `sep.layout: Layout`). `convert_sample_to_closest_feasible` — check if it's already ported (likely in `uniform_sampler.rs`). `practically_contained_items` — port whole, it's Layout-generic.

4. **Infeasible solution pool.** Sparrow uses `Vec<(SPSolution, f32)>`. We'd use `Vec<(LayoutSnapshot, f32)>`. Confirm the binary_search_by + normal-distribution selection mechanic ports cleanly (rand_distr::Normal may need adding as a dep — check Cargo.toml).

5. **Cancel/progress hooks.** Plan Task 6 step 2: "Accept a `cancel_token: &AtomicBool` + `progress_callback: &ProgressCallback` — no-op for S2.5a." But Task 14 introduces real cancel/progress; we already have `Terminator` + `SolutionListener` traits from Task 5 with Noop impls. Should `exploration_phase` take `term: &impl Terminator` + `listener: &mut impl SolutionListener` (reusing Task 5 traits) rather than `cancel_token: &AtomicBool` directly? Justify.

6. **Config.** Sparrow has `ExplorationConfig` with fields `shrink_step` (SPP-only, delete), `max_conseq_failed_attempts`, `solution_pool_distribution_stddev`, `large_item_ch_area_cutoff_percentile`. Propose BPP `ExplorationConfig` shape + paper defaults (find in sparrow's `src/config.rs`).

7. **Budget wiring.** Plan says "consume 80% of `time_budget_ms`". In Task 5 we decided budget lives outside the Separator (in the Terminator). Should explore take `time_budget_ms: u64` directly, build a `BasicTerminator` with an 80% timeout, and pass it into separator.separate()? Or should it receive a pre-armed terminator?

8. **Tests.** Propose 3-4 unit tests: (a) warm-start seed feasible → returns unchanged or tighter. (b) warm-start seed infeasible but resolvable → returns Feasible after N disrupts. (c) warm-start seed unresolvable → returns best-found Infeasible after max_conseq_failed_attempts. (d) determinism under fixed seed.

9. **Deviations list** for the file header. Use the same format as `separator.rs` deviation block (see that file's top-of-file comment for the template).

10. **Sequence check.** What symbols does upstream `explore.rs` require that are NOT yet ported (e.g., `rand_distr::Normal`, `practically_contained_items`)? List them and mark "port-now" vs "use-existing" vs "elide".

## Output

Markdown report at the path above. Under 2500 words. Be concrete — line refs to sparrow, jagua-rs 0.7.1, and our existing gls/ ports.

No code edits.
