# Task 11 plan sign-off — Codex

Plan file: `docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md`.

## Context

Your earlier report at `.claude/research/task11/codex-report.md` returned NEEDS-REVISION with three structural findings:

1. `warm_start::greedy_bottom_left` probe is unsound (width/clearance bug).
2. Acceptance metric must be lexicographic `(closed_bins, concentration)`.
3. State must be count-based, transactional.

Claude (I) synthesized your report + Gemini's into
`docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md`. The plan:

- §2: probe fix as prerequisite commit (your issue #1).
- §3: count-based state (your invariants + idiom).
- §4: lex score (your metric).
- §5: `Result<Option<FfdAssignment>, PackError>` (your error idiom).
- §6: your 8-item debug_assert checklist.
- §7: 15 unit + 3 integration = 18 tests (Gemini's 9 + your 6 additions).
- §8: TDD sequence.
- §9: no `pack.rs` wiring — Task 12 owns that.

## Your task

Read the plan. Return a short sign-off report at
`.claude/research/task11/codex-signoff.md` covering:

1. **Blockers addressed?** Do §2 (probe fix), §3 (state), §4 (metric), §5 (error idiom) accurately reflect your prior report?
2. **§2 correctness** — is my clearance-inflation formula (`w+2c, h+2c` with the `y_offset` bin-bottom adjustment) correct? Walk through whether it over/under-counts at the bin boundary.
3. **§4 metric** — is the lex score (Score(u32, f64)) formula + acceptance rule correct as written?
4. **Determinism** — scan orders in §5.1/§5.2/§5.3 match your prior report?
5. **Missing tests?** Are there additional invariant checks from your §8 debug_assert list that don't have coverage in §7?
6. **Verdict:** approve-as-written / approve-with-changes / needs-revision.

Keep it under 800 words. Be strict — this is a correctness gate, not a cheerleader review.

Files to read:
1. `docs/superpowers/plans/2026-04-18-s2.5-task11-cross-bin-swap.md` — the plan.
2. `.claude/research/task11/codex-report.md` — your prior work.
3. `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — probe being fixed.
4. `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — FFD reference for style.
