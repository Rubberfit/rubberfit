# Task 5 research — Gemini deep-read

## Context

The REMA cut planner is porting Sparrow's Guided Local Search loop into our Rust engine. Upstream is `github.com/JeroenGar/sparrow`, tag `ejor-snapshot` (commit `c95454e3`), MIT licensed. Ports are retyped for jagua-rs BPP (bin packing) instead of SPP (strip packing).

**Plan status (S2.5):**
- Tasks 1-4 done (commits `36e725b`..`14e8043` on `refactor/rf-engine`).
- Task 5 now: port `src/optimizer/separator.rs`.
- Future tasks 6-7 port `explore.rs` + `compress.rs`. Task 14 adds progress + cancel.

**Already ported under `engine/crates/rema-layout/src/infrastructure/search/gls/`:**
- `tracker.rs` = sparrow `quantify/tracker.rs` — CollisionTracker, CTSnapshot, register_item_move, restore_but_keep_weights, get_total_loss, get_total_weighted_loss, get_loss(pk), get_weighted_loss(pk), update_weights, save, clone.
- `sampling.rs` = sparrow `sample/search.rs` — `search_placement(layout, item, ref_pk, evaluator, sample_config, rng) -> (Option<(DTransformation, SampleEval)>, n_evals)`, plus `SampleConfig`.
- `sep_evaluator.rs` = sparrow `eval/sep_evaluator.rs` — `SeparationEvaluator::new(layout, item, pk, &ct)`.
- `assertions.rs` = `tracker_matches_layout`, already asserted in tracker.
- `coord_descent.rs`, `uniform_sampler.rs`, `best_samples.rs`, `specialized_pipeline.rs`, `bit_reversal_iterator.rs`, `overlap_proxy.rs`, `quantify.rs`, `pair_matrix.rs`, `consts.rs`, `sample_eval.rs`.

The upstream sparrow clone is at `/tmp/sparrow-research/sparrow/`. Read anything you need there.

**Target:** port `Separator` into `gls/separator.rs` (and `gls/worker.rs` if you recommend splitting) retyped for jagua BPP primitives.

## Your assignment

Produce a concrete adaptation plan. Do not write Rust code — write a design report that I can execute from. Touch every point below:

1. **File layout recommendation.** Plan says one file `gls/separator.rs`. Sparrow has `separator.rs` (258 LOC) + `worker.rs` (123 LOC) — workers are required for compile. Recommend either (a) inline SeparatorWorker into separator.rs or (b) add `gls/worker.rs` alongside. Give pros/cons for our repo.

2. **Type substitution table.** List every `jagua_rs::probs::spp::entities::*` symbol used in `separator.rs` and `worker.rs` and map it to its `jagua_rs::probs::bpp::entities::*` equivalent. Include method-level adaptations (e.g., `SPProblem::strip_width()` has no BPP analogue — drop `change_strip_width`). Prove the mapping by reading the jagua-rs 0.7.1 source (on crates.io or github tag 0.7.1).

3. **`Separator` scoping.** Does our Separator wrap `BPProblem` or a single `Layout`? Our Task 5 operates on one bin at a time (per plan Task 8). Multi-bin coordination is Task 12. Decide: does `Separator` hold `BPProblem + LayoutIndex`, or should we construct it against a single layout (which requires `&mut Layout` handling differently)? Read jagua-rs BPProblem API to justify.

4. **`SeparateOutcome` enum.** Plan says `Separator::separate()` returns `SeparateOutcome::{Feasible, Infeasible(Pool)}`. Upstream returns `(SPSolution, CTSnapshot)`. Propose the concrete shape of `SeparateOutcome` (what goes in each variant, what is `Pool`?). The downstream consumers are Task 6 `explore.rs` (penalty-weight loop) and Task 7 `compress.rs` (polish). Justify that the proposed shape is sufficient for both.

5. **Terminator + SolutionListener.** Upstream uses `trait Terminator { fn kill() -> bool; new_timeout; timeout_at; }` and `trait SolutionListener { fn report(...) }`. Task 14 introduces our real progress/cancel. For Task 5, what stubs do we define? Propose minimum viable traits so Task 14 can later slot in without churn.

6. **Parallel workers.** Upstream uses rayon `ThreadPool`. Our workspace has no rayon dep yet. Options:
   a. Add rayon now.
   b. Single-threaded Separator for S2.5a, add rayon in Task 18 (tuning).
   c. Use `std::thread::scope` (zero dep cost, slightly worse locality).
   Recommend one and explain the trade-off (CI speed, build time, WASM compatibility — pack-cli is native only so WASM doesn't matter).

7. **`change_strip_width` replacement.** Strip packing varies the strip width — sparrow's `change_strip_width` shifts items right of a split. For BPP this method is meaningless (bin width is fixed). Confirm we simply delete it in our port and that no downstream ported file calls it.

8. **Tests.** Plan says "Tests: on a trivially feasible seed, `separate()` returns `Feasible` without iteration." Propose 3-4 concrete unit tests that validate the port. For each test, name the fixture, the assertion, and how to construct the BPProblem seed cheaply (hint: look at existing tests in `engine/crates/rema-layout/tests/`).

9. **Deviation list.** Enumerate every behavioural or structural deviation from upstream. Our ported code already carries deviation comments at the top of each file (see `tracker.rs` header for example). Propose the deviation block for `separator.rs`.

10. **Sequence check.** Confirm nothing is blocking. If an upstream symbol is required but not yet ported (e.g. `Terminator`, `SolutionListener`, `SepStats`, `SeparatorWorker`, `FMT`), explicitly list it so I know whether to port it in Task 5 or cut it.

## Output

Write `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task5/gemini-report.md` with the ten sections above. Be concrete — file paths, line numbers, type signatures.

Do NOT modify any source files. Pure research output.
