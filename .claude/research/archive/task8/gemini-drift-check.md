# Task 8 drift check — Gemini

**Verdict: APPROVE.**

Implementation matches the plan at `docs/superpowers/plans/2026-04-18-s2.5-task8-optimize.md` cleanly. All three Codex corrections I conceded at sign-off are present in the code. No drift detected.

## Checklist

1. **OptimizerConfig fields + no `Default`** — PASS. `search/mod.rs:65-81` adds `bin: Bin`, `items: Vec<Part>`, `clearance: f64`. Derives are `Clone, Debug` only; `Default` dropped. Rationale documented at `mod.rs:59-64`.

2. **6-step `optimize` body** — PASS. `mod.rs:90-134` runs: build_instance (92-96) → Layout::new + replay (100-102) → Separator::new (106-107) → BasicTerminator (111) → exploration_phase + compression_phase (114-125) → snapshot_to_seed (128-133). Numbering in comments matches the plan §3.2 exactly.

3. **`int_to_ext_transformation` on ORIGINAL `Part.polygon`** — PASS. `mod.rs:208-216`: `pre_transf = &item.shape_orig.pre_transform`, `abs_transf = int_to_ext_transformation(&pi.d_transf, pre_transf)`, then `part.polygon.iter().map(...)` applies `abs_transf` to the ORIGINAL polygon (via `&items[pi.item_id]`), not jagua's `PlacedItem.shape`. Correct.

4. **Sort by `(item_id, tx_bits, ty_bits, rot_bits)`** — PASS. `mod.rs:193-201` collects into `Vec<&PlacedItem>`, then `sort_by_key` on the 4-tuple with `.to_bits()` on the three floats. Determinism locked in before the renumbering loop.

5. **`HashMap<&str, usize>` lookup** — PASS. `mod.rs:149` `HashMap<&str, usize> = HashMap::with_capacity(items.len())`, duplicate-shape_id guard at 151-156, unknown-shape_id guard at 162-167. Codex §3.3 fix honoured verbatim.

6. **5 new tests** — PASS. `mod.rs:344-559`: `resolves_colliding_warm_start_seed`, `respects_time_budget`, `preserves_overflow_for_oversized_input`, `determinism_same_seed_same_output`, `snapshot_to_seed_uses_external_transform`. Three S2 passthrough tests gone. Note: `respects_time_budget` uses a 10s ceiling rather than the plan's "50ms + 50ms slack" — justified inline (BasicTerminator only polled at top of outer strike loop). Documented, defensible drift.

7. **`pack.rs:30` throwaway `to_jagua_instance` deleted** — PASS. `pack.rs:24-44` goes straight from warm-start (line 33) to `search::OptimizerConfig` construction (36-43) to `search::optimize` (44). The deletion is explicitly narrated in the comment at 29-32.

8. **Stale 80/20 wording scrubbed** — PASS. `explore.rs:25-27` now reads "Task 8 allocates 100% of time_budget_ms to exploration; compression is identity in BPP (Task 7) so the sparrow 80/20 split doesn't apply." `terminator.rs:8-10` reads "Task 8's `search::optimize` arms for the exploration phase (compression is identity per Task 7, so 100% of the budget goes to exploration)."

## §2 divergence resolutions

- Density-lift assertion: ABSENT from tests (Test 1 is legality-preservation). Codex win upheld.
- Polygon reconstruction via `int_to_ext_transformation`: present at `mod.rs:209`, Codex win upheld.
- Sorted iteration before renumbering: present at `mod.rs:193-201`, Codex win upheld.

## Follow-ups noted (not drift)

Three debug_assert downgrades + jagua profile override (`Cargo.toml:38-39`) are documented in `.claude/research/task8/followups.md` and flagged for Task 9. These are emergent discoveries from enabling real GLS, not plan drift.

Proceed to commit.
