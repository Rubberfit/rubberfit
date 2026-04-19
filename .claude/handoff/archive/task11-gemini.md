# Task 11 research — cross-bin swap operators for REMA Portal Rust nesting engine

## Context

We are in phase S2.5b of the Rust nesting engine migration. The codebase is at `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal`, Rust workspace at `engine/`. The branch is `refactor/rf-engine`, HEAD is `d64a6d1` (Task 10 FFD just shipped).

**Parent plan:** `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` (Task 11 at line 272).

**Completed context:**
- Task 1-9: full sparrow GLS port (Separator + explore + compress + RNG + quantify + tracker + sampler + eval)
- Task 9.5: custom pipeline superset invariant restored
- Task 10: FFD bin-assignment just shipped — `ffd_assign()` at `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`. Pure function, deterministic 4-level sort. `pack.rs` now calls `ffd_assign` once up-front, then per-bin `search::optimize`.

## Your assignment — Task 11 research

Produce a design for cross-bin swap operators. Output goes to `.claude/research/task11/gemini-report.md`.

**Parent plan spec (verbatim from 2026-04-18-s2.5-rust-engine.md Task 11):**

```
### Task 11: Cross-bin swap operators

**Files:** `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`

Steps:
1. `swap_two(a_bin, b_bin)` — try moving one item from A to B and one from B to A. Keep if global density improves.
2. `migrate(a_bin, b_bin)` — try moving N items from A to B, ignoring A's remainder. Used when closing a bin.
3. `unload_lightest_bin` — try to empty the lowest-density bin into others.
4. Tests: handcrafted scenarios with known-optimal swaps.
5. Commit: `feat(search): cross-bin swap operators (swap/migrate/unload)`
```

## Research questions

1. **API shape.** How should the three operators compose? Are they pure functions taking `&[SeedResult]` + bin refs and returning a new `Vec<SeedResult>`, or do they mutate an in-progress assignment? What's the error type? (see `ffd.rs` for the idiom — pure function returning `Result<FfdAssignment, PackError>`). What's the right result type for cross-bin ops?

2. **Fit-check primitive.** Task 10's `ffd_assign` used `warm_start::greedy_bottom_left` as the probe. Should Task 11 use the same primitive, or does it need something stronger (e.g. can we already use `search::optimize` with a short budget as the probe)? What's the CPU tradeoff?

3. **Density metric.** "Keep if global density improves" — define precisely. Is it sum-of-placed-area / sum-of-bin-area? Per-bin weighted? How does `unload_lightest_bin` compute "lightest" — scrap_ratio desc? Filled-area asc?

4. **Item selection heuristic for `swap_two`.** Which item from A, which item from B? Random, area-based, boundary-based? Look at sparrow's cross-bin swap (if any) in the vendored source at `engine/crates/rema-layout/src/infrastructure/search/gls/` — does sparrow have a cross-bin swap primitive we should port, or is this fresh code?

5. **`migrate` semantics.** "Move N items from A to B, ignoring A's remainder, used when closing a bin." Clarify: does migrate try to move ALL of A's items, or N as a parameter? What happens to items that don't fit in B — fall back to overflow, stay in A, or try other bins?

6. **`unload_lightest_bin` algorithm.** Target selection (lowest density), then greedy: for each item in target, try to migrate to the highest-density bin that has room? Or BFD ordering? What's the accept criterion — must all items find homes, or keep going even if some overflow?

7. **Integration point.** Where does this get called from? `pack.rs` after the FFD assignment + per-bin optimize? Or as a phase between FFD and optimize? Or as a post-optimize compression pass? Check the parent plan Task 12 ("integrate FFD + swap into search::optimize") — what's the call order.

8. **Determinism.** Cross-bin swaps involve choosing items. We MUST be deterministic under fixed seed (cardinal invariant across the project — see Task 10 plan section 3.4). Do we need RNG injection, or are we strictly greedy-with-stable-tie-breaks?

9. **Test scenarios.** Concrete handcrafted fixtures where each operator produces a provably better layout than no-op. At least 3 per operator, plus determinism tests + idempotency tests (running the same op twice gives the same result).

10. **Guardrails / bugs to avoid.** What are the sharp edges? (Lost items, duplicated instance_index, infinite loops from swap-then-swap-back, etc.)

## Deliverable

A `.claude/research/task11/gemini-report.md` containing:
1. Module layout + type design (structs, API signatures)
2. Algorithm specs for all three operators with pseudocode
3. Concrete test scenarios (at least 9 total)
4. Integration point recommendation (where pack.rs calls this)
5. Sharp edges + guardrails
6. A design verdict: approve/needs-revision

Aim for ~1500-2500 words. Write it so Codex can cross-check and so I (Claude) can implement from it without further clarification.

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` — the established assignment-op idiom (pure function, deterministic sort, no RNG)
- `engine/crates/rema-layout/src/infrastructure/search/assignment/mod.rs` — module shell
- `engine/crates/rema-layout/src/application/pack.rs` — shows how FFD is integrated; Task 11 will slot in similarly
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — `SeedResult`, `SeedPlacement`, `greedy_bottom_left`
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` — `optimize()`, `OptimizerConfig`
- `engine/crates/rema-layout/src/infrastructure/search/gls/` — vendored sparrow code; grep for any `swap` / `migrate` / `cross_bin` / `unload` to see if sparrow has these primitives
- `docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md` lines 254-290 — Task 10-12 context
- `docs/superpowers/plans/2026-04-18-s2.5-task10-ffd.md` — full Task 10 plan for style/depth reference

Do not modify any files. Just research and write the report.
