# Task 7 second opinion — Codex

## Context

S2.5 Task 6 shipped as `2d01b09`. Task 7 ports sparrow `src/optimizer/compress.rs` (Algorithm 13) into `gls/compress.rs`.

Parent plan: "Port sparrow's compress.rs. Fixed-container polish: try tighten + separate, accept improvements only. Budget: remaining 20% of time_budget_ms."

## The problem

Sparrow's compression_phase (72 LOC at `/tmp/sparrow-research/sparrow/src/optimizer/compress.rs`) is literally "shrink the strip, re-separate, if feasible keep." BPP bins don't shrink. The Task 6 port already deleted `change_strip_width`.

A parallel Gemini researcher is deciding between:
- **(A)** No-op pass-through (compression is meaningless for fixed-size bins).
- **(B)** Geometric compaction — push items toward a corner, minimize bounding box.
- **(C)** GLS polish — run another Separator cycle with tighter params.

Their output is at `.claude/research/task7/gemini-report.md`.

## Your assignment

Read `/tmp/sparrow-research/sparrow/src/optimizer/compress.rs` + `src/config.rs` + our merged `engine/crates/rema-layout/src/infrastructure/search/gls/{separator.rs, explore.rs}` + `search/objective.rs` + `search/state.rs`. Then produce an independent second opinion at `.claude/research/task7/codex-report.md`.

Specifically answer:

1. **A, B, or C?** Don't wait to see Gemini's pick — decide independently. Ground in: sparrow paper Algorithm 13 intent, BPP bin-fixity, what Task 12 cross-bin swap wants, whether 20% budget is actually earning its cost.

2. **If "no-op pass-through" wins, does the plan's "tests: compress never worsens density" still make sense?** A no-op trivially satisfies that — but the whole point of the test is to catch regressions in a real compression. Is the test vacuous if A wins? Propose a non-vacuous alternative.

3. **Risks to flag Gemini probably won't catch:**
   - **BppObjective mismatch.** It scores multi-bin SearchState. Compression operates on one Layout. Any risk the plan's "consult BppObjective" sub-step leads to lifting a single Layout into a fake SearchState with all-zero bins for the others — masking real improvements?
   - **Time budget waste.** If compression is a no-op, 20% of time_budget_ms is dead weight; should Task 8 reallocate that to explore instead?
   - **Determinism across explore/compress seam.** Explore seeds its workers from `sep.rng`. If compress also uses `sep.rng`, the sequential consumption must be stable across runs.
   - **Single-threaded worker reuse.** Is it safe to reuse the Task 5 Separator's `Vec<SeparatorWorker>` across a compression phase?

4. **Config shape.** If we need a `CompressionConfig`, what's the minimum set of fields vs upstream's SPP-heavy one?

5. **Testable invariant.** Propose one property-style test that MUST hold under your chosen design (A/B/C). Example for C: "running compress twice in a row on the same feasible seed produces the same post-compression layout (determinism)."

## Output

≤1500 words at the path above. If sandbox is read-only, print for Claude to save. Verdict: APPROVE for Claude to draft the plan / REJECT pending more research. Line refs to upstream + our code. Concrete.

No code edits.
