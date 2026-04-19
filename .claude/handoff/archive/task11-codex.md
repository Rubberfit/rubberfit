# Task 11 research — cross-bin swap operators (Codex voice)

## Context

Branch: `refactor/rf-engine`, HEAD = `d64a6d1` (Task 10 FFD shipped).
Workspace: `engine/` (Cargo). Parent plan:
`docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md`, Task 11 at
line 272.

Task 10 just landed `ffd_assign()` at
`engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`
as a pure deterministic function. Task 11's sibling operators
(`cross_bin_swap.rs`) slot into the same `assignment/` module.

Gemini is doing research in parallel. Your role: **independent
implementation-focused review** — anticipate the sharp edges, the
bugs that will bite us in impl, and the correctness invariants the
parent plan doesn't spell out.

## Your assignment

Write `.claude/research/task11/codex-report.md` — an
implementation-focused companion to Gemini's design report.

**Parent plan Task 11 spec:**

1. `swap_two(a_bin, b_bin)` — move one item from A to B and one from B to A, keep if global density improves.
2. `migrate(a_bin, b_bin)` — move N items from A to B, ignoring A's remainder. Used when closing a bin.
3. `unload_lightest_bin` — empty lowest-density bin into others.
4. Tests: handcrafted scenarios with known-optimal swaps.

## Key implementation questions to cover

1. **Cardinality invariant.** Task 10 already requires that FFD seeds
   every copy it routes (separator.rs:390 preserves placed
   cardinality). Cross-bin swaps must also preserve global
   cardinality: `sum(per_bin[i].placements.len()) + overflow.len()`
   must stay constant before/after any operator. Spell out exactly
   how each operator enforces this. What happens when `migrate` fails
   to fit some items in B — do they go back to A, to overflow, or
   error?

2. **Duplicate shape_id invariant.** `replay_seed_into_layout` at
   `search/mod.rs:144` errors on duplicate shape_id rows in a bin's
   item list. Cross-bin operators must maintain this. After a swap,
   both bins' item lists must still be dedupe-by-shape-id. Walk
   through the edge case: A has 3 copies of shape X + 1 copy of
   shape Y; B has 2 copies of shape X. What does swap_two(X_from_A,
   X_from_B) mean — net-zero swap (reject as no-op?) or reindex?

3. **Determinism under fixed seed.** Every cross-bin operator must
   be deterministic (bit-identical output for same inputs). Which
   items get picked for swap? If we iterate all (i, j) pairs, the
   order matters. Lock a tie-break rule.

4. **Fit-check cost.** The probe in Task 10 used
   `warm_start::greedy_bottom_left` (a fast greedy placer). For Task
   11, each operator may need hundreds of probes (unload scans all
   items). What's the CPU budget? Options:
     - `warm_start::greedy_bottom_left` — fast, but may false-reject
       (miss feasible placements that GLS would find).
     - `search::optimize` with 50ms budget — slow, more accurate.
     - Pure bbox feasibility (sum of areas fits in bin) — trivially
       fast, upper bound only.
   Recommend one, with concrete scenarios where each trade-off
   applies.

5. **Accept criteria.** "Global density improves" — how do we measure?
     - `sum_placed_area / sum_bin_area` across ALL bins?
     - Or only bins involved in the swap?
     - Or a weighted metric that rewards emptying a bin (which closes it)?
   Recommend a metric that aligns with our business goal (REMA is
   fabric cut planning — emptying a bin means returning it to stock).

6. **Infinite-loop prevention.** swap_two may swap X↔Y and then the
   next call swaps Y↔X (reverse). Do we need a tabu list, or does
   "accept only if density improves" (strict >) prevent cycling?
   Prove it.

7. **`unload_lightest_bin` termination.** When is the operator done?
   After emptying one bin, do we re-select the new lightest and
   repeat? Or single-shot? Recommend termination condition + test
   scenarios.

8. **Integration with pack.rs.** Where should these operators be
   called? Task 12 wires them into `search::optimize` but Task 11
   just builds the operators. For Task 11 testing, write standalone
   integration tests (not yet wired to pack.rs).

9. **Error handling.** Should operators return `Result<_, PackError>`
   with a specific variant for "no improvement possible", or just
   return `Option<NewAssignment>` where None means no-op? Recommend
   the cleaner Rust idiom.

10. **Invariant assertions.** What debug_asserts should each operator
    emit? (e.g. "placed cardinality unchanged", "no duplicate
    shape_id per bin", "bins[i].placements.len() + overflow sum
    matches").

## Deliverable format

`.claude/research/task11/codex-report.md` with these sections:

1. Executive summary (50 words): approve/needs-revision verdict
2. Cardinality + duplicate-shape-id invariants — formal statements
3. Fit-check primitive recommendation
4. Density metric — formula
5. Determinism spec — exact tie-break rules
6. Termination conditions for each operator
7. Error handling idiom
8. Debug assertions checklist
9. Sharp edges / gotchas (numbered list)
10. Verdict

Aim 1200-2000 words. Implementation-focused — light on motivation, heavy on "if you don't handle X, impl will break."

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — style + idiom reference
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` (around line 138-270, replay_seed_into_layout + its preconditions)
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` — cardinality preservation lives here; understand what it guarantees
- `engine/crates/rema-layout/src/application/pack.rs` — current call graph
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` — full context

Do not modify any code. Output to `.claude/research/task11/codex-report.md` only.
