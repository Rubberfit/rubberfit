# Task 14 research — progress streaming + cooperative cancel (Gemini)

## Context

REMA Portal Rust nesting engine, phase S2.5c. Branch `refactor/rf-engine`,
HEAD = `7a7b4d1` (Task 13 shipped, S2.5b tagged as
`s2.5b-multi-bin-coordination`).

S2.5a: sparrow GLS port (tasks 1-9.5). S2.5b: FFD + cross-bin swap
operators + `optimize_multi` orchestrator (tasks 10-13). Next up:
progress streaming + cooperative cancellation so pack-cli can emit
NDJSON progress frames and stdin-based cancellation.

## Parent plan Task 14 spec

```
### Task 14: OptimizerConfig progress + cancel fields

Files:
- search/mod.rs
- search/progress.rs (new)
- search/cancel.rs (new)

Steps:
1. Add `progress_callback: Option<ProgressCallback>` and
   `cancel_token: Option<Arc<AtomicBool>>` to OptimizerConfig.
2. `ProgressCallback = Arc<dyn Fn(PackProgress) + Send + Sync>`.
3. `PackProgress { iteration, elapsed_ms, best_placed_count,
   best_density, phase: "explore"|"compress" }`.
4. GLS polls cancel_token every 50 iterations. On cancel, return
   best-so-far cleanly.
5. Progress fires on each new best-so-far improvement — monotonic
   only (§10.4 of spec).
6. Tests: cancellation returns within 100ms; progress fires at
   least once per fixture.
7. Commit: feat(search): progress streaming + cooperative cancellation
```

## Research questions

1. **Layering of cancel token.** `search::optimize` runs per-bin;
   `optimize_multi` (Task 12) iterates rounds. Where do we check
   the token? Options:
     a. Inside Separator's strike loop (deep, every K iterations).
     b. Inside optimize_multi's outer round loop (coarse, between
        rounds only).
     c. Both — Separator quick-exits inside, orchestrator quick-exits
        outside.
   Recommend, with cancel-latency analysis (target ≤100ms).

2. **Progress callback threading.** `ProgressCallback` is
   `Arc<dyn Fn(PackProgress) + Send + Sync>`. It crosses through:
   `pack()` → `optimize_multi()` → `search::optimize()` → Separator's
   `SolutionListener::report_improving`. Is the current
   SolutionListener trait the right place to hang progress? Or should
   progress have its own trait that lives alongside?

3. **Monotonic "best-so-far" vs noisy "every-improvement".** Sparrow's
   `report_improving` fires on any layout with lower collision loss —
   which isn't the same as "more items placed" or "better density."
   How do we compute monotonic-only progress frames from the lossy
   stream? Cache last-fired state + filter to `best.placed_count >
   last.placed_count || best.density > last.density`.

4. **Cancel semantics.** On cancel, return current best-seen state.
   What's "current best" in a multi-bin context? optimize_multi holds
   the cached FfdAssignment; if cancelled mid-round with some bins
   already refined and others not, we return whatever bin states we
   have. Is that safe? What about cardinality guarantees?

5. **Terminator integration.** The current `BasicTerminator` at
   `search/terminator.rs:38` already has a deadline-driven `kill()`.
   Task 14 adds cancel-driven kill. Should we compose them (a
   `CompositeTerminator` OR-ing them), or add a new trait
   implementation `CancelToken: Terminator` that wraps both?

6. **Progress frame shape.**
   `PackProgress { iteration, elapsed_ms, best_placed_count,
   best_density, phase }`. Is the iteration counter per-bin, global,
   or orchestrator-round? `phase` = "explore" | "compress" comes from
   sparrow's `ExplorationPhase` / `CompressionPhase`. We also have a
   new "operator" phase in Task 12. Add a fourth enum variant?

7. **Test scenarios.** Cancellation returns within 100ms; progress
   fires at least once per fixture. What fixtures? What's the
   determinism story — fixed seed, same inputs, does the progress
   sequence vary run-to-run due to wall-clock?

8. **Serialization.** pack-cli (Task 15) will serialize `PackProgress`
   to NDJSON. Does the frame shape serialize cleanly via serde? Field
   naming (camelCase for JSON or snake_case for Rust)?

9. **Error handling on cancel.** `Result<PackResult, PackError>` —
   what PackError variant signals "cancelled cleanly"? Or do we
   treat cancel-with-partial-result as `Ok(PackResult)` with a new
   `PackResult::was_cancelled: bool` field?

10. **Atomics and threading.** `Arc<AtomicBool>` is the spec shape.
    Is there a lighter-weight primitive (e.g. `std::sync::mpsc`) that
    would match the single-writer/single-reader pattern better? Or
    is AtomicBool correct?

## Deliverable

`.claude/research/task14/gemini-report.md`. ~1500-2000 words.

Structure:
1. Layering recommendation (§1)
2. Progress trait design (§2)
3. Monotonic filter algorithm (§3)
4. Cancel semantics + cardinality (§4)
5. Terminator composition (§5)
6. Frame shape + phase enum (§6)
7. Serialization strategy (§8)
8. Error handling (§9)
9. Test scenarios (at least 6)
10. Verdict: approve / needs-revision

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` —
  OptimizerConfig, optimize() entry.
- `engine/crates/rema-layout/src/infrastructure/search/terminator.rs` —
  BasicTerminator.
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` —
  Separator + SolutionListener trait + separate() loop.
- `engine/crates/rema-layout/src/infrastructure/search/gls/explore.rs` —
  ExplorationPhase.
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` —
  Task 12 orchestrator, where cancel needs to integrate.
- `engine/crates/rema-layout/src/application/pack.rs` — top-level
  entry.
- `engine/crates/pack-cli/src/main.rs` — Task 15 will consume the
  progress frames.
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` Task 14 +
  15 specs.

Do not modify any code. Output only the report.
