# Handoff: sparrow spike design — need dual sign-off

**Date:** 2026-04-19
**Status:** Design-only. No code yet. Seeking Codex + Gemini review before implementation.
**Branch:** `refactor/rf-engine`
**Parent context:** `.claude/handoff/next-session-sparrow-spike.md`, `.claude/research/sparrow-integration/codex-report.md`, `.claude/research/sparrow-integration/gemini-report.md`, `.claude/research/tier6-tail-remnant/decision.md`.

## Baseline (just re-measured, 2026-04-19 08:40)

| Fixture | Metric | Rust | Legacy |
|---|---|---:|---:|
| Single-bin (37 parts, 78×396×1) | Placed | 13/37 | 33/37 |
| Single-bin | Fab Score | **71** | 57 |
| 2-bin | Placed | 37/0 (13+24) | 37/0 (33+4) |
| 2-bin | Fab Score | 46 | **52** |
| 2-bin | Tail remnant roll-2 | 0.01" | 125.63" |
| Parity | — | 27/27 ✓ | — |
| Rust `cargo test --release` | — | all green ✓ | — |

## Goal of this session

Lift single-bin placed ≥ 28 (ideally 33-35) and 2-bin Fab Score ≥ 50 by reusing REMA's existing BPP-shaped sparrow port under `engine/crates/rema-layout/src/infrastructure/search/gls/`. Parity must stay 27/27. Runtime must stay < 1500ms for the 37-part 2-bin request.

## Inventory findings (already done — please verify)

- `Separator::separate` is per-bin, standalone-callable. Does NOT assume multi-bin state. (`search/gls/separator.rs:238`)
- `exploration_phase` is already per-bin BPP-adapted. (`search/gls/explore.rs:115`)
- `compression_phase` is confirmed identity pass. (`search/gls/compress.rs:60`)
- `search::optimize(seed, config)` (`search/mod.rs:104-151`) already exposes the full `replay_seed → Separator::new → exploration_phase → compression_phase → snapshot_to_seed` pipeline per-bin.
- `pair_matrix` + `CollisionTracker` are per-layout, no global state.
- `multi.rs::optimize_single_bin_fast_path` already proves the single-bin call shape.
- `cross_bin_swap.rs:679-683` has the receiver-repack portfolio `[BSSF, BottomLeft, Auto]` where a sparrow variant would slot in.

## THE CRITICAL SEMANTIC BLOCKER (newly confirmed, needs your judgment)

Codex's original sparrow scoping report flagged this:

> REMA's current sparrow-derived GLS only optimizes already-placed items. It never sees overflow items, so it cannot rescue a 13-part warm start into 33 by itself. A real gain only appears if Sparrow-style search is moved earlier, while the full requested multiset is still in play.

I re-read the code today and confirm this exactly:

1. `SeparatorWorker::move_items` (`separator.rs:445-455`):
   ```rust
   let mut candidates: Vec<PItemKey> = self.layout.placed_items.keys()
       .filter(|pk| self.ct.get_loss(*pk) > 0.0)
       .collect();
   ```
   Only items with nonzero collision loss are considered. Zero-collision items are never touched.

2. `exploration_phase` (`explore.rs:115-203`): loops `sep.separate()`. On `Feasible` returns immediately. On `Infeasible` the disrupt is `swap-two-large + relocate-contained` (`explore.rs:234-355`). It NEVER adds or removes items — item count is invariant.

3. `replay_seed_into_layout` (`search/mod.rs:160-211`): iterates `seed.placements` and places each. Never attempts items outside the seed.

**Consequence:** If I call `search::optimize(bssf_seed_13_items, cfg)` with a bigger budget, it is a **guaranteed no-op**. Separator finds zero collisions → returns the same 13 placements untouched. This is exactly the "bigger budget won't help" trap.

**To beat 13/37, the spike MUST start with >13 items in the layout, with overlaps, and let Separator resolve collisions.**

## Three candidate designs

### Design A — naive wrapper (KNOWN BAD, listing to rule out)

`fixed_bin_sparrow_repack(bin, items, clearance, budget_ms)` = `search::optimize(bssf_seed, cfg_with_bigger_budget)`.

Rejected on first-principles: no-op per above.

### Design B — "force all 37 items, hope overlaps resolve"

```
1. For each of 37 requested parts, pick a placement (bottom-left cascade
   ignoring overlaps, or jittered random within the bin). All 37 are
   PlacedItems in the Layout.
2. Run exploration_phase with `time_budget_ms` — Separator will now see
   heavy collision loss and actually have work to do.
3. If it returns Feasible: we have 37 feasible placements. Ship it.
4. If it returns Infeasible after budget: the "best pool snapshot"
   still has overlapping items. We POST-PROCESS by greedily removing
   the highest-weighted-loss item until loss == 0. Return what remains.
```

**Unknowns I need sign-off on:**
- Can `exploration_phase` genuinely resolve, say, 20+ overlapping items in 500ms on our production fixture? The paper defaults assume the outer SPP strip-shrink loop is the usual source of infeasibility; in BPP we'd be feeding it a MUCH worse starting state than upstream typically sees.
- Is the pool in `explore.rs:136-193` still sorted by total loss on the BEST seen snapshot, or does it contain only the final snapshot at each strike? If only the final, we lose intermediate "best feasible subset" candidates. A peek at `insert_sorted_by_loss` suggests only infeasible snapshots enter the pool at all — so if we never reach Feasible, the pool has what? The last infeasible snapshots?
- Post-process item removal: is greedy "remove highest-loss item" monotone in total_loss? Or can removing an item INCREASE loss of others via the GLS weight interactions?
- `disrupt_solution` is swap-two-large. With 37 items forced in, disrupt happens AFTER each failed separate. Does that help or just shuffle overlaps around?

### Design C — "outer-loop item-count shrink" (sparrow-true for BPP)

```
1. Start with N = 37 items force-placed.
2. Call exploration_phase(budget = budget_ms / expected_iters).
3. If Feasible: accept, try N+1 if items remain. If no more, done.
4. If Infeasible: drop 1 item (the highest-loss one, or the largest
   one that would most reduce loss). N -= 1. Back to step 2.
5. Stop when budget exhausted or N stops changing between iters.
6. Return the best feasible layout seen.
```

This is ~400-700 LOC as Codex originally estimated. It owns the outer loop that sparrow's SPP optimizer would otherwise own (via strip-shrink).

**Unknowns I need sign-off on:**
- Budget partitioning across outer iters. If we shrink from 37 down to 28, that's 9 exploration_phase calls — each gets ~55ms of 500ms. Way too little for Separator's strike machinery to converge. Do we start smaller (N=28) and grow, or start larger and shrink with cumulative time tracking?
- Item-drop heuristic: max loss? max convex-hull area? fixed order? Is this better or worse than random?
- Is this a "first commit" or does it need to be split?

### Which design wins?

My instinct: **Design C with a smart starting N** — start at, say, N = 30 (legacy - 3), expand if feasible, shrink if not, with per-call budget ≥ 200ms. Budget: 1 second total. Commit 1 = the bones. Commit 2 = the heuristics.

But this is exactly the kind of design choice I want Codex + Gemini to pressure-test before I burn LOC.

## Specific questions for the reviewer

1. **Does Design C actually match how sparrow's SPP solver works internally?** I.e., is the strip-shrink outer loop isomorphic to an item-count shrink outer loop? If yes, the existing `exploration_phase` is correctly scoped for Design C. If no, we need to re-port.

2. **Is there a simpler shape I'm missing?** Specifically: does jagua-rs or sparrow have a "place item against current layout with minimum-displacement retry" primitive that we could use to iteratively ADD items to a feasible 13-item layout, resolving collisions incrementally?

3. **Budget sanity check.** For the 78×396 single-bin fixture with 37 items, what is a realistic `exploration_phase` call time to reach convergence or strike-exhaust? Is 500ms too short? Too long? Does the answer differ if we start at 20 forced items vs 35?

4. **Determinism.** Force-placing 37 items with a "bottom-left cascade ignoring overlaps" is deterministic. Forcing them with random jitter requires a seed. Either is fine, but which gives Separator a better starting state?

5. **Parity risk.** The 27 parity fixtures already run through the existing `search::optimize`. If we add Design C as a new entry point (not a change to `optimize`), parity shouldn't move. Confirmed? If we wire into `cross_bin_swap.rs::consolidate_tail_bin` as a 4th strategy, does that risk changing cross-bin swap decisions on the parity fixtures?

6. **Kill criterion.** Handoff says "stop if Fab Score < 48 or single-bin < 25 after Commit 2". Given Designs A/B/C above, which would you estimate is most at risk of tripping the kill criterion, and why?

## Please respond with

- Verdict: A, B, C, or "none — here's D".
- Concrete MVS (Minimum Viable Spike) in ≤ 150 LOC of signatures (not full impl): what pub fns, what struct/enum shapes, what call sites.
- Red-flag risks I haven't listed above.
- Budget / seed / determinism specifics.
- Whether Commit 1 / Commit 2 split still makes sense for your chosen design.

Keep the response concrete and under 1200 words.
