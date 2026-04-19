# Task 9 second-opinion — Codex

## Context

S2.5 Tasks 5-8 shipped today. Task 8 (`9eb2ab3`) enabled real GLS in `search::optimize` and exposed three latent debug-only issues mitigated with `warn!`/profile overrides. Task 9 closes S2.5a with property/timing tests + attempts to burn those mitigations down.

Parent plan Task 9: 100-fixture collision property, density-≥-warm-start property, timing test. All three need refinement — you already caught on Task 8 that single-bin GLS can't improve density. Parallel Gemini researcher at `.claude/research/task9/gemini-report.md` (once written) will address the property-test refinements.

The three burn-down items:
1. `gls/specialized_pipeline.rs` / `gls/assertions.rs::custom_pipeline_matches_jaguars` — custom pipeline emits strictly fewer hazards than jagua's default pass on certain fixtures.
2. `gls/separator.rs:~269` weighted-loss invariant — cascade of #1.
3. jagua-rs `qt_hazard.rs:111` — internal invariant on `constricted_hazards` fires on our clearance+tight-bin fixtures.

Full writeup: `.claude/research/archive/task8/followups.md`.

## Your assignment

Independent root-cause investigation. Write `.claude/research/task9/codex-report.md` (or print if sandbox read-only).

For each of the three items:

1. **Minimal reproducer.** Try to produce the smallest possible fixture that trips it. Concrete Rust inputs.

2. **Root-cause diagnosis.** Read both our ported code AND sparrow upstream AND jagua source. Tell me where the bug lives.

3. **Fix proposal.** If you can pinpoint the fix, write the diff. If it's upstream-only, draft the GitHub issue text (title + repro + expected vs actual).

4. **If unfixable in Task 9 timeframe** — argue whether the mitigation is acceptable long-term. Be honest. Codex sign-off on Task 8 called them "defensible for this commit, only acceptable if Task 9 treats them as mandatory follow-up." Do you still hold that line, or is one of them legitimately a "won't fix" for us?

Also address:

5. **S2.5a tag gating.** The parent plan's `s2.5a-industry-competitive` tag was implied to land at end of Task 9. Argue for or against landing it with any burn-down items still mitigated. What's the commit-level bar?

6. **Property-test refinements.** Beyond "no collisions" and "cardinality preserved," what other invariants are worth asserting in `tests/gls_integration.rs`? Don't over-engineer — max 4 property tests total.

## Output

≤1500 words at the path above. If sandbox is read-only, print full text. Verdict: APPROVE for Claude to draft the plan / REJECT pending further research.
