# Task 8 second opinion — Codex

## Context

Tasks 5-7 shipped. Task 8 replaces `search::optimize` passthrough in `engine/crates/rema-layout/src/infrastructure/search/mod.rs` with the real pipeline: build BPInstance+Layout from seed, run `exploration_phase`, run `compression_phase` (identity), translate to `SeedResult`.

A parallel Gemini researcher is deciding between:
- **A** — extend `SeedResult` to carry `BPInstance`/`Bin`/`Part` data.
- **B** — add `bin: Bin, items: Vec<Part>` to `OptimizerConfig`.
- **C** — change `search::optimize` signature (parent plan forbids).

Research at `.claude/research/task8/gemini-report.md` (once written).

## Your assignment

Independent read. Write report at `.claude/research/task8/codex-report.md`.

Answer these:

1. **A, B, or C** — don't wait for Gemini. Ground in: signature-stability, clean-architecture layering, and real code lookup in the merged tree.

2. **Specific risks Gemini might miss:**
   - `SeedResult::PartialEq` derive — does adding `BPInstance` (or `Vec<Part>`) preserve PartialEq? The existing warm_start tests use `assert_eq!` on SeedResult.
   - `SeedPlacement`'s `polygon` field is the **transformed** polygon (warm_start.rs:62-66). When Task 8's optimize translates the post-GLS `Layout` back to `SeedResult`, does it also produce transformed polygons, or does the translation require the original?
   - Overflow semantics: `SeedResult::overflow` is a `u32` count. After GLS rearranges, how do we recover the overflow count? Some items in `remaining` have no matching placement in the final Layout — those are overflow. Confirm the bookkeeping.
   - `OptimizerConfig::seed: Option<u64>` — `None` means "non-deterministic" per rng.rs. After Task 8, is deterministic behaviour still possible for seeded runs? Worker RNGs are seeded from master via `rng.random()` in Separator::new.
   - Parity snapshots — existing `.snap` will diverge. How many fixtures, and is the baseline refresh a simple `-u` or do we need manual inspection?

3. **Budget reallocation.** Plan was 80/20 explore/compress. Compress is identity. What's your recommended allocation? Any reason NOT to go 100% explore (e.g. reserving ~5% for Task 12 cross-bin swap later)?

4. **Test strategy.** With real GLS, tests in `search/mod.rs` currently assert passthrough identity — they'll fail. Propose:
   (a) unit tests for the `SeedResult ↔ LayoutSnapshot` translation functions,
   (b) one integration test that runs the full `optimize` pipeline and asserts density > warm-start baseline on a simple fixture.

5. **`rust-perf.test.ts` risk.** Plan step 5 requires <3s fast mode. With real GLS (3 workers × 200 iterations × 50 samples per iteration on a single bin), is that budget realistic for Q4 32B Qwen... wait, that's wrong — GLS is Rust, not LLM. GLS runtime is dominated by `collect_poly_collisions` calls. Realistic 3s for a fast mode on REMA's typical fixtures?

6. **Improvement budget.** `OptimizerConfig::improvement_budget_ms` is `Option<u64>`. Currently unused. Wire it to `exploration_phase` somehow? Or defer to Task 14?

## Output

Report at the path above (or print if sandbox is read-only). ≤1500 words. Verdict: APPROVE for Claude to draft the plan / REJECT pending more research.
