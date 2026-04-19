# Task 10 plan sign-off — Gemini

You wrote the initial design at `.claude/research/task10/gemini-report.md`. Claude synthesized with Codex's findings into `docs/superpowers/plans/2026-04-18-s2.5-task10-ffd.md`.

Codex added two guardrails Gemini may have missed:
1. **No duplicate shape_id in per-bin config.items** — `replay_seed_into_layout` at `search/mod.rs:144` errors on duplicates. FFD must collapse quantity when N copies of the same shape land in the same bin.
2. **FFD must seed every copy it routes** — `search::optimize` cannot recover missing seeds (cardinality-preserving).

Both are encoded in plan §2 + §3.8 deviation block.

Verify the plan:

1. **§3.1 module layout** (`assignment/mod.rs` + `ffd.rs`) — matches your recommendation?
2. **§3.4 four-level sort key** (area desc → longest edge desc → shape_id asc → instance ordinal) — matches yours?
3. **§3.5 bin ordering** (priority desc → Remnant before Fresh → input order) — matches `buildPackRequest.ts:19`?
4. **§3.6 core algorithm** — the two-phase approach (probe-with-growing-trial-items, then materialize-per-bin-parts) — any issues?
5. **§3.7 pack.rs rewiring** — replace per-bin loop with one ffd_assign call + iterate zipped per_bin. Any regression risk?
6. **§4 tests** — 6 unit + 1 integration. Anything missing?
7. **`FfdAssignment.overflow: Vec<(String, u32)>`** — per-shape list vs single counter. You proposed the per-shape variant; Codex noted pack.rs recomputes the global count anyway. Acceptable?

Write verdict at `.claude/research/task10/gemini-signoff-task10.md`. Under 500 words. APPROVE / APPROVE WITH CHANGES / REJECT.
