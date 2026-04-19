# Task 14 research — progress + cancel (Codex, gpt-5.4-pro)

## Context

REMA Portal Rust engine, phase S2.5c. Branch `refactor/rf-engine`,
HEAD `7a7b4d1` (S2.5b tagged `s2.5b-multi-bin-coordination`).

S2.5b shipped: FFD + cross-bin swap + `optimize_multi` orchestrator.
Task 14 adds `ProgressCallback` + `Arc<AtomicBool>` cancel wiring
through the search layer so pack-cli (Task 15) can stream NDJSON
progress frames and accept stdin-based cancellation.

Gemini is writing a design-focused companion at
`.claude/research/task14/gemini-report.md`. You write
`.claude/research/task14/codex-report.md` as the
implementation-focused second opinion — **anticipate the sharp edges
Gemini will miss** and flag anything that will bite during impl.

Now running on `gpt-5.4-pro` — bring your deepest correctness
reasoning.

## Parent plan Task 14 spec

1. Add `progress_callback: Option<ProgressCallback>` + `cancel_token:
   Option<Arc<AtomicBool>>` to `OptimizerConfig`.
2. `ProgressCallback = Arc<dyn Fn(PackProgress) + Send + Sync>`.
3. `PackProgress { iteration, elapsed_ms, best_placed_count,
   best_density, phase: "explore"|"compress" }`.
4. GLS polls `cancel_token` every 50 iterations.
5. Progress fires on monotonic best-so-far only.
6. Tests: cancel returns ≤100ms; progress fires ≥ once per fixture.

## Your key implementation questions

1. **Where does the cancel check actually land in the hot loop?**
   Sparrow's `Separator::separate()` calls `term.kill()` every iter
   at `separator.rs:255`. If we wrap the user's `cancel_token` in a
   new `Terminator` impl, do we lose latency granularity?
   - Trace: 1 inner iteration ≈ 1-10ms (depends on fixture).
   - 50-iter polling gap → worst-case cancel latency 500ms. Too
     slow for the 100ms target.
   - Options: check cancel every iter (cheap — `AtomicBool::load`);
     OR every iter-no-imprv boundary; OR at top of `move_items`.
   Recommend the implementation location AND polling granularity.

2. **Composing cancel with existing `BasicTerminator`.** Current
   `BasicTerminator` deadline + new cancel token. Trait `Terminator`
   is `&impl Terminator`. Options:
   - `CompositeTerminator { deadline: BasicTerminator, cancel:
     Arc<AtomicBool> }` with `kill() = deadline.kill() ||
     cancel.load(Relaxed)`.
   - Swap `BasicTerminator` to own the cancel token: single struct,
     `BasicTerminator { deadline, cancel }`.
   Latter is simpler but couples concerns. Recommend.

3. **Monotonic progress filter.** Sparrow fires `report_improving`
   on ANY layout with lower collision loss — not monotonic in
   placed_count/density terms. How do we filter? Options:
   - Stateful wrapper around `SolutionListener` that tracks
     `last_reported_placed`, `last_reported_density`; only forwards
     if strict improvement.
   - Lossy filter inside Separator: only report when an explore-pool
     transition happens (placed_count changes).
   Recommend. Include concrete filter algorithm with edge cases
   (first report, reporting during compress phase, etc.).

4. **Multi-bin progress semantics.** Separator runs per-bin. A
   "best-so-far" for a single bin isn't a global best. optimize_multi
   has to aggregate: when one bin improves, does that fire a global
   progress frame? What's `best_placed_count` — sum across all bins?
   best_density — mean or aggregate?
   Consider: pack.rs aggregates at the end; during search, do we
   want frames per-bin-improvement or per-round-improvement?

5. **`ProgressCallback` lifetime across threads.** `Arc<dyn Fn(...)
   + Send + Sync>` allows cloning + calling from any thread. But
   sparrow's Separator worker pool (separator.rs:212-218) spawns
   N workers. If workers fire progress concurrently, are we ordered?
   Recommend ordering strategy (single-threaded callback or Mutex).

6. **Cancel mid-commit in optimize_multi.** If cancel fires while
   `apply_operator_ladder` is running (mid-probe), do we:
   - Return current `cur` (pre-operator state)?
   - Return the operator's partial result?
   - Error out?
   Task 11 operators are transactional — partial commits don't exist
   for them. So "return current `cur`" is the clean path. But during
   an operator call the orchestrator has already handed off; how do
   we interrupt? Is `cancel.load()` check inside `bin_fits` probe
   warranted?

7. **Cancelled-with-partial-result PackResult.** What do we return?
   - `Ok(PackResult)` with a new `was_cancelled: bool` field?
   - `Err(PackError::Cancelled { partial: PackResult })`?
   - `Err(PackError::Cancelled)` + caller has to reconstruct?
   Partial result is useful for UI streaming. Recommend the API.

8. **Serialization stability.** `PackProgress` fields end up in
   NDJSON (Task 15). Field naming: serde rename_all = "camelCase"?
   Field stability across versions (is `phase` a String or enum —
   enum can't be extended without breaking wire compat).

9. **Testing cancel latency.** How do we write a deterministic
   test for "cancel returns within 100ms"? Flaky on slow CI?
   - Use a fixture with a long budget (5s).
   - Spawn a thread that sets cancel flag at t=50ms.
   - Assert pack() returns by t=200ms.
   - But wall-clock. Recommend the right assertion cap.

10. **`ProgressCallback` panics.** If a user's callback panics,
    does that take down the search thread? Wrap in `catch_unwind`
    or let it propagate? Recommend.

## Deliverable

`.claude/research/task14/codex-report.md`. ~1200-1800 words.

Structure:
1. Executive summary (50 words): approve/needs-revision verdict
2. Hot-loop polling location + granularity (§1)
3. Terminator composition (§2)
4. Monotonic filter algorithm (§3)
5. Multi-bin aggregation (§4)
6. Concurrency + callback ordering (§5, §10)
7. Cancel mid-operator (§6)
8. PackResult shape for cancel (§7)
9. Serialization stability (§8)
10. Test strategy (§9)
11. Sharp edges / gotchas (numbered list of 6+)
12. Verdict

Implementation-focused — "if you don't handle X, impl will break."

## Files to read first

Same set as Gemini:
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs`
- `engine/crates/rema-layout/src/infrastructure/search/terminator.rs`
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs`
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` (Task 12)
- `engine/crates/rema-layout/src/application/pack.rs`

Do not modify any code.
