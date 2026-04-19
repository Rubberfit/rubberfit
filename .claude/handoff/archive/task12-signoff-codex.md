# Task 12 plan sign-off — Codex

Plan: `docs/superpowers/plans/2026-04-18-s2.5-task12-orchestrator.md`.

## Context

Your prior report at `.claude/research/task12/codex-report.md` returned NEEDS-REVISION with 12 sharp edges + an executive summary demanding resumable per-bin search sessions, authoritative cached assignment state, transactional touched-bin rebuilds, global-deadline / fixed-quota budget, deterministic scheduling, and exp back-off.

Claude (I) synthesized your report + Gemini's into `docs/superpowers/plans/2026-04-18-s2.5-task12-orchestrator.md`. The plan:

- §3 **batch-mode interpretation** (deliberate scope compromise): each round optimizes every non-empty bin to strike-limit, then runs operators, then repeats. Avoids the full Separator resumability refactor but loses fine-grained interleaving.
- §4 cached state preserved — orchestrator never round-trips through `snapshot_to_seed`/`state_from_assignment`.
- §5 transactional commits — each operator is already transactional; orchestrator just threads `FfdAssignment` through.
- §6 determinism via orchestrator `Xoshiro` RNG + derived per-bin seeds.
- §7 global deadline + fixed per-bin quota, NO redistribution.
- §8 pack.rs as thin aggregator, global `instance_index` renumbering preserved.
- §9 sharp edges directly from your §10 list.
- §10 6 unit + 3 integration tests + all 151 existing regressions.

## Your task

Return a short sign-off at `.claude/research/task12/codex-signoff.md` covering:

1. **Batch mode trade-off** — Is batch-mode acceptable for Task 12? Or does it bury parity regressions you'd catch under iteration-level interleaving? Specifically: does re-optimizing every non-empty bin per round (discarding Separator state between rounds) introduce determinism issues beyond what fixed-seed-per-round compensates for?

2. **Single-bin fast path** — §3.4: n_bins==1 skips the round loop and calls today's `optimize()` directly. Does that correctly preserve Task 9's parity test fixtures?

3. **Back-off semantics** — §3.1 uses `operator_gap = min(gap * 2, MAX_GAP)` with `TERMINATION_ROUNDS = 3` consecutive no-op rounds → exit. Matches your §6 recommendation?

4. **`optimize_all_bins` deterministic seed derivation** — §3.2 draws `orch_rng.next_u64()` per bin per round. Bit-identical output across runs?

5. **Missing invariants** — any from your §10 list not covered in the plan's §9 (sharp edges/guardrails)?

6. **Verdict:** approve-as-written / approve-with-changes / needs-revision.

Keep it under 700 words. Be strict — this is a correctness gate.

Files:
1. `docs/superpowers/plans/2026-04-18-s2.5-task12-orchestrator.md` — plan.
2. `.claude/research/task12/codex-report.md` — your prior report.
3. `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` lines 200-430 (Separator::separate).
4. `engine/crates/rema-layout/src/application/pack.rs` lines 1-130 (current pack() body).
