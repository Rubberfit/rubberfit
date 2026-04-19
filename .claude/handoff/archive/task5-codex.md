# Task 5 research — Codex second opinion

## Context

We are porting sparrow's Separator (`src/optimizer/separator.rs` + `src/optimizer/worker.rs`) from strip-packing (SPP) to bin-packing (BPP) for the REMA cut planner's Rust nesting engine. Sparrow upstream: `github.com/JeroenGar/sparrow`, tag `ejor-snapshot`, MIT licensed.

Sparrow source is at `/tmp/sparrow-research/sparrow/`. Our code is at `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/engine/crates/rema-layout/`. Branch: `refactor/rf-engine`.

Tasks 1-4 already ported 14 files under `src/infrastructure/search/gls/` (see `mod.rs` for the list). Task 5 is the `Separator` port.

The plan file is `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` — re-read Task 5 in there.

A separate Gemini researcher is writing `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task5/gemini-report.md` covering architecture (type map, file layout, SeparateOutcome shape, Terminator/Listener stubs, test set).

## Your assignment

Provide an independent second opinion focused on risks Gemini's plan might miss. Write `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task5/codex-report.md`.

Cover these angles:

1. **Hidden SPP assumptions.** Read sparrow's `separator.rs` and `worker.rs` carefully. List every place that implicitly assumes strip-packing semantics (infinite strip, single layout, monotone width, etc.). For each, explain the BPP equivalent and whether it requires a behaviour change vs. a mechanical retype.

2. **Borrow checker traps.** Sparrow's `Separator::move_items_multi` clones `BPSolution`-equivalents across rayon workers; the `.workers.iter_mut().min_by_key()` pattern + subsequent borrow of `.prob` + `.ct` is tricky. Predict where the borrow checker will push back when we switch to `BPProblem`, and propose refactors that keep the same semantics but pass the checker. Cite line numbers from sparrow's `separator.rs`.

3. **`BPProblem::place_item` / `remove_item` signature quirks.** Does BPProblem require a `LayoutIndex` on placement? Read jagua-rs 0.7.1 at `github.com/JeroenGar/jagua-rs`, tag `0.7.1`, file `src/probs/bpp/entities/`. Verify the signatures the worker depends on. Flag any API that doesn't exist on BPP.

4. **Determinism + RNG.** Sparrow seeds workers via `Xoshiro256PlusPlus::seed_from_u64(rng.random())`. Confirm this still produces deterministic output in our single-threaded port (Task 5 should remain deterministic even if we're single-threaded — Task 18 adds parallelism). Any hidden non-determinism (`HashMap` iter, rayon order) we need to worry about?

5. **`strike_limit` + `iter_no_imprv_limit` defaults.** Sparrow paper values. Confirm they are already in our `gls/consts.rs`; if not, list which constants need to be added and with what values.

6. **Budget contract.** The upstream Separator runs until its terminator fires. Our Task 6 (explore) will budget 80% of `time_budget_ms` to the Separator. Does the Separator need to know its budget, or does the Terminator? Argue for a clean contract.

7. **Property tests.** Propose two property tests (proptest-style — we don't have proptest as dep yet, so regular `#[test]` + fixed seeds for now) that validate separator invariants. Examples: "every call to `separate()` leaves the collision tracker consistent with the layout" (via `tracker_matches_layout`), "a feasible input exits in 0 iterations with Feasible outcome."

8. **Integration tests.** Propose one integration test (can go in `engine/crates/rema-layout/tests/`) that constructs a 5-shape toy BPP instance, warm-starts it with a deliberately colliding layout, calls `Separator::separate()`, and asserts `Feasible` + no collisions.

9. **Known gotchas from the sparrow paper.** Read the sparrow paper (arXiv 2509.13329) if you can find it or its algorithm pseudocode. Identify any "tuning constants" the paper calls out that we might be missing. Specifically verify `GLS_WEIGHT_*` constants already in our `consts.rs` against paper values.

10. **Independent recommendation.** If you disagree with any likely Gemini recommendation, say so. We value rigour over agreement.

## Output

Markdown file at the path above. Be terse but concrete — file paths, line numbers, code snippets.

Do NOT modify any source files. Pure research output.
