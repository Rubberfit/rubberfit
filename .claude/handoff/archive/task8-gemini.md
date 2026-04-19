# Task 8 design — Gemini deep-read

## Context

S2.5 Tasks 5-7 shipped today as `c59be2f`, `2d01b09`, `b92bc2c` on `refactor/rf-engine`. We now have:
- `gls/separator.rs` — `Separator::separate` (Algorithms 5, 9, 10) returning `SeparateOutcome::{Feasible, Infeasible}`.
- `gls/explore.rs` — `exploration_phase()` (Algorithm 12) returning `ExplorationOutcome::{Feasible, Infeasible}`.
- `gls/compress.rs` — `compression_phase()` as identity pass-through (BPP-honest port).
- `search/terminator.rs` — `BasicTerminator` deadline primitive.

Task 8 replaces the S2 passthrough in `search/mod.rs::optimize()` with the real pipeline: build BPInstance + Layout from the warm-start seed, run explore, run compress, translate back to `SeedResult`.

## Parent plan Task 8 steps (lines 111-121)

> 1. Replace the passthrough with real GLS: build `BPProblem` from seed, run explore, run compress, translate back to `SeedResult`.
> 2. Existing `pack.rs` orchestrator unchanged — `search::optimize(seed, cfg)` still has the same signature.
> 3. Run parity tests: new Rust snapshots replace the warm-start-only ones; expect significant density lift on simple fixtures.
> 4. Update `tests/packing/parity/__snapshots__/parity.test.ts.snap` via `npm run test -- tests/packing/parity -u`.
> 5. Verify rust-perf budget still met (<3s for fast mode on all fixtures).
> 6. Commit.

Plus follow-ups captured from Tasks 6 + 7:
- Reallocate the 80/20 explore/compress budget split to **100% explore** (Task 7's compression is identity).
- Scrub stale 80/20 wording at `explore.rs:25-26` and `terminator.rs:8-9`.

## The design tension

**Plan step 2 says "same signature":** `search::optimize(seed: SeedResult, config: OptimizerConfig) -> Result<SeedResult, PackError>`.

**Plan step 1 says "build BPProblem from seed":** but `SeedResult` / `SeedPlacement` carry only **translated** polygons (warm_start.rs:62-66), not the original Part shapes. Rebuilding a `BPInstance` from only the seed requires un-translating polygons, then deduplicating by `shape_id`, then re-running `jagua_adapter::to_jagua_instance`. That is possible but adds complexity and a potential source of float-precision bugs.

`pack.rs` already has `bin` and `remaining` in scope (pack.rs:24,30) and already calls `jagua_adapter::to_jagua_instance(std::slice::from_ref(bin), &remaining, request.clearance)` — then throws the result away (line 30). The real design question is where this call moves to.

### Candidate A — "Seed carries everything"

Extend `SeedResult` to carry `BPInstance` (or its input `Bin` + `&[Part]`). `warm_start::greedy_bottom_left` constructs both together. Keeps `search::optimize(seed, cfg)` signature clean; pack.rs untouched beyond wiring.

Pros: honours parent plan step 2 literally. Clean ownership. Consolidates the jagua build in one place.
Cons: bloats `SeedResult` (adds jagua coupling to a previously domain-only type). Breaks `SeedResult`'s Clone/Debug/PartialEq derives (BPInstance may not derive PartialEq). Ripples into warm_start's own unit tests.

### Candidate B — "Config carries jagua context"

Add `bin: Bin, items: Vec<Part>` to `OptimizerConfig`. `pack.rs` populates them per iteration. `search::optimize` rebuilds the `BPInstance` internally.

Pros: `SeedResult` stays lean/domain-only. Signature of `optimize` unchanged. pack.rs change is one field at the call site.
Cons: `OptimizerConfig` grows jagua-adjacent domain fields, which isn't philosophically pure but is the common idiom in Rust. Doubles the jagua_adapter call (pack.rs did the throwaway call at L30; we'll now call it inside optimize too) — mitigate by moving pack.rs's line 30 to feed a reused instance.

### Candidate C — "Signature breaking change"

Change `search::optimize(seed, cfg)` to `search::optimize(bin, items, seed, cfg)` or take a pre-built `BPInstance`. Violates parent plan step 2.

Pros: cleanest.
Cons: the parent plan explicitly says no. Breaks Task 1's stable-surface promise.

## Your assignment

Produce `/Users/danielmartinezjulio/Work/arc and anchor/rema-portal/.claude/research/task8/gemini-report.md` covering:

1. **Pick A, B, or C (or propose D).** Ground your choice in: the parent plan's signature-stability rule, the clean-architecture layering of `SeedResult` vs `BPInstance`, and what Task 12 (multi-bin coordination) will want from this API.

2. **Budget wiring.** Given compress is identity, allocate 100% of `time_budget_ms` to explore. How does `BasicTerminator` get armed? Where does the 10% fast-mode safety margin (if any) live? What about `improvement_budget_ms` (currently `Option<u64>` on `OptimizerConfig`)?

3. **`LayoutSnapshot → SeedResult` translation.** Extract each `PlacedItem`'s `d_transf` + `item_id`, look up the item's polygon from the `BPInstance`, apply the transform to produce a `SeedPlacement`. `rotation_rad` + `(x, y)` + transformed polygon + bbox width/height. Overflow: items in `remaining` that have no corresponding placement in the final layout count as overflow (vs SPP which doesn't have this concept). Propose the exact translation function signature + the edge cases (items whose `quantity > 1` but only some placed).

4. **Stale-wording cleanup.** Explicit file:line list of stale 80/20 references to scrub, with the replacement wording.

5. **Existing test updates.** `search/mod.rs` has 3 passthrough tests (`passthrough_returns_seed_unchanged_empty`, etc.). Those tests become invalid once optimize does real work. Replace with what?

6. **Parity test impact.** `tests/packing/parity/__snapshots__/parity.test.ts.snap` is an existing snapshot. After S2.5a lands, density will change. The plan says update via `npm run test -- tests/packing/parity -u`. But: the snapshot tests were gated by the S2 "conservation only" guard (task #44 / plan line 250). Should Task 8 also tighten the cross-engine tolerance per plan Task 19, or defer?

7. **Determinism.** With real optimize, seed=42 must produce the same output twice. Propose a determinism test at the `search::optimize` seam that runs the full pipeline twice and asserts output equality.

8. **Performance budget.** Plan step 5 — "rust-perf budget still met (<3s for fast mode on all fixtures)." `tests/rust-perf.test.ts` exists — where does it live and what does it measure? Does Task 8 need to tune anything to stay under budget?

9. **Deviations list** for the file header of the updated `search/mod.rs`. Same format as separator/explore/compress deviation blocks.

10. **Sequence check.** Anything new required to be ported or built this task? What does this enable for Tasks 9-12?

## Output

Markdown at the path above. ≤2500 words. Concrete, with file:line refs. No source edits.
