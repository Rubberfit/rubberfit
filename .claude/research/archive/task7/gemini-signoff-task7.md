# Task 7 sign-off — Gemini

**Verdict: APPROVE.**

I concede Option C. Codex's technical proof holds against our merged `separator.rs`, and the plan at `docs/superpowers/plans/2026-04-18-s2.5-task7-compress.md` is the honest BPP port of Algorithm 13.

## §2 divergence — proof verified, no surviving edge case

I walked every branch of `separate()` and `move_items()` on a feasible input. The proof is airtight:

- Entry to `separate()` at `separator.rs:244` captures `min_loss = 0.0`. The outer `'outer` loop at line 255 does not guard on `min_loss`, so it enters once. Inside, `move_items_multi()` at 343 dispatches to each worker's `move_items()` (line 417). The filter at line 425 (`self.ct.get_loss(*pk) > 0.0`) yields an empty `candidates` Vec on a feasible layout. `candidates.shuffle(&mut self.rng)` on an empty Vec is a no-op; the `for &pk in candidates.iter()` loop body never executes. `move_items_multi` then copies the (unchanged) worker state back. Control returns to the inner loop, `loss = 0.0` still holds, and the `loss == 0.0` branch at line 274 fires → `break 'outer`.
- No "tighter params" reachable from `SeparatorConfig` change this. `strike_limit`, `iter_no_imprv_limit`, and `stddev` all gate *how long the outer/inner loops can run*; none of them bypass the candidate filter. My C proposal of `strike_limit=5`, `iter_no_imprv_limit=100`, `stddev=0.1` would produce the same zero-move trajectory.
- Worse, a fresh `Separator::new` for compression (which C requires to inject different `sample_config`) calls `rng.random()` per worker at `separator.rs:217`, perturbing the master RNG *before doing any work*. That breaks Codex §5's "identity on RNG stream" invariant without buying anything.

C is dead code. I retract it.

## §3.3 BppObjective non-consultation — agreed

My lifting shim (wrap a single `Layout` in a dummy single-bin `SearchState` with zeroed others) is lossy in exactly the way Codex identifies: `BppObjective` scores `total_overflow() + total_placed()` over the whole state, so a single-layout lift cannot surface intra-bin geometry gains. My own C proposal acknowledged this gap (§4 "extend the `BppObjective`"), but that extension is Task 1 / Task 18 work, not Task 7. Consulting a half-lifted objective here would ship a subtly broken comparator. Skip it.

## §3.6 tests — correct invariants

State identity (item_id + `d_transf` tuple equality, sort-stable) and RNG identity (4-draw lockstep against a cloned master) are the right two invariants for a pass-through. "Density never worsens" is vacuous when the output is the input. Nothing missing — I considered suggesting a listener-silence assertion, but `NoopListener` in the test harness already enforces that structurally.

## §6 commit message — honest

The message names the sparrow source, states the BPP adaptation plainly ("the faithful BPP port of Algorithm 13 is identity"), cites both proof lines, and records the Task 8 budget implication. No hedging.

## Task 18 follow-ups — please record these explicitly

The plan's §8 already captures the BppObjective bbox-fragmentation term and the "future BPP compression heuristic" seam. Two refinements worth pinning:

1. **Bbox-fragmentation tiebreak (`total_ch_area / bounding_box_area`)** — deferred to Task 18, *blocked on Task 12 swap-operator telemetry*. Only worth adding if swap-failure data shows fragmentation is the bottleneck.
2. **Tighter-param Separator variant** — drop entirely. The filter at `separator.rs:425` makes it unreachable on feasible input regardless of params; it has no place on the Task 18 list.

Plan is locked. Ship it.
