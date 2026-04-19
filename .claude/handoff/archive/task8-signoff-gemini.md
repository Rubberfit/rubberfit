# Task 8 sign-off — Gemini

You wrote the initial design at `.claude/research/task8/gemini-report.md` (picked Candidate B, 10 sections). Claude synthesized with Codex's second opinion into the plan at:

**`docs/superpowers/plans/2026-04-18-s2.5-task8-optimize.md`**

Codex won three material corrections to your original design:

1. **Density test dropped.** You proposed `real_optimize_lifts_density_above_warm_start`. Codex flagged that `Separator` only *moves* placed items (separator.rs:390 preserves cardinality) — single-bin GLS cannot increase placed count or density. Replaced with legality-preservation test (colliding seed → loss==0, same cardinality).

2. **Polygon reconstruction via `int_to_ext_transformation`.** Your design applied `pi.d_transf.compose()` directly to `Part.polygon`. Codex caught that jagua applies a `pre_transform` during import. Plan §3.4 now uses `jagua_rs::io::export::int_to_ext_transformation(&pi.d_transf, &item.shape_orig.pre_transform)` — verified the helper exists at `export.rs:34`.

3. **Sorted iteration before renumbering.** SlotMap order is unstable; sort by `(item_id, tx, ty, rot)` before assigning `instance_index`.

## Your job

Review the plan. Either **concede** the three corrections (they're technical fixes, not design rewrites) or **refute** any of them.

Specifically verify:

1. **§2 Divergence resolution** — do you agree with all three Codex wins? Any edge case where density *could* improve in a single-bin warm-start-already-feasible scenario?
2. **§3.4 `snapshot_to_seed` — polygon math.** `apply_dtransformation_to_point` applies rotation then translation. Does that match jagua's decomposition convention (rotate about origin, then translate)? If wrong, pack results will be geometrically shifted.
3. **§3.5 pack.rs update** — deleting the `to_jagua_instance` throwaway at pack.rs:30 removes a validation call. Does that cost us anything (e.g., geometry error earlier vs deeper)?
4. **§4 tests** — 5 new tests, 3 passthrough tests deleted. Coverage sufficient? Anything missing?
5. **§10 S2.5a correction note** — agree that the parent plan's "+3-5% density single-bin" claim is wrong and the real value prop is "legality lift, not density lift"?

## Output

Write `.claude/research/task8/gemini-signoff-task8.md`. Verdict: APPROVE / APPROVE WITH CHANGES / REJECT. Under 500 words.
