# Task 8 sign-off — Codex

Verdict: **APPROVE WITH CHANGES**

1. **§2 divergence resolution:** Yes. The three corrections landed faithfully: density-lift is gone in favor of legality-preservation Test 1; polygon reconstruction uses `int_to_ext_transformation`; placements are sorted before renumbering.

2. **§3.2 `optimize` body:** The 6-step pipeline is the right Task 8 shape. No engine step is missing. `to_jagua_instance(...)?` preserves the geometry-validation/error path when the throwaway call is deleted from `pack.rs`. `NoopListener` is fine for Task 8 because progress/cancel belongs to Task 14. Reusing one timeout terminator is fine because compression is identity.

3. **§3.3 `replay_seed_into_layout`:** Tighten this. Do **not** rely on positional matching or per-placement linear scans. Build one explicit `HashMap<String, usize>` from `config.items` keyed by `shape_id`, and error on missing or duplicate ids. That is more robust than assuming seed order forever matches config order.

4. **§3.4 transform math:** Yes. jagua’s `DTransformation` is rotation-about-origin then translation (`rot_transl_m` in `transformation.rs`), so `rx = px*cos - py*sin + tx`, `ry = px*sin + py*cos + ty` matches `compose()`. Combined with `int_to_ext_transformation`, this is the correct external-space reconstruction path.

5. **§3.7 deviation block:** Honest overall. Minor improvement: explicitly note that Task 8 still uses `NoopListener` / timeout-only termination and defers progress + cancellation to Task 14.

6. **§5 step 9:** Yes. Inspecting all 9 parity snapshot diffs before `-u` is sufficient.

7. **`improvement_budget_ms`:** Deferral still stands. Keep it unwired until Task 14.

8. **Anything missing:** Only the §3.3 map correction above. Everything else is ready for implementation.
