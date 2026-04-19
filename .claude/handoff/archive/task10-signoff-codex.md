# Task 10 plan sign-off — Codex

Your research at `.claude/research/task10/codex-report.md` landed 2 hard guardrails + fixture recommendations + TDD ordering hints. All encoded in the plan at `docs/superpowers/plans/2026-04-18-s2.5-task10-ffd.md`.

Verify:

1. **Guardrail #1 (no duplicate shape_id per bin)** — §2 + §3.6 use `HashMap<String, u32>` per-bin with `materialize_parts` step at the end. Covered?

2. **Guardrail #2 (FFD seeds every copy it routes)** — §3.6 probes via `warm_start::greedy_bottom_left(..., trial_items)` with cumulative quantity AND materializes the final per_bin via the same path with the final collapsed items. So the SEED is the real warm-start of the final items, not a reconstruction. Acceptable?

3. **`Part.quantity: u32` vs `Bin.priority: Option<i32>`** — §3.3 + §3.6 use the correct types per your catch. Confirm.

4. **Empty-inputs: Err, not Ok** — §3.6 returns `PackError::NoBins` / `NoItems` matching `pack.rs:180`. Right behavior?

5. **Test scenarios** — §4 Test 1 uses your Scenario A (20×20, 10×10, 10×5 on 20×20 + 20×15, small-small-big ordered). §4 Test 7 is the pack-level regression. Anything else from your three scenarios worth adding?

6. **TDD ordering** — §5 starts with tie-break determinism (your early-red-test suggestion). Good?

7. **`pack.rs` wiring** — §3.7 shows the rewire. Check that `pack.rs:100`'s global overflow recomputation still works with FFD emitting per-bin overflow=0 (since FFD's own overflow becomes the global residual).

Write verdict at `.claude/research/task10/codex-signoff-task10.md` (print if sandbox read-only). ≤400 words. APPROVE / APPROVE WITH CHANGES / REJECT.
