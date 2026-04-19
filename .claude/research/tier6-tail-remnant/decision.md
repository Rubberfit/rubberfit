# Tier 6: Tail-remnant preservation — Decision

**Date**: 2026-04-19
**Status**: Implemented. Incremental gain only (12/25 → 13/24). Packer ceiling is the real bottleneck.

## Decision

Implement Codex's **option D: explicit consolidation operator**
(`consolidate_tail_bin`) in
`engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`,
scheduled after `unload_lightest_bin` in `apply_operator_ladder`.

## Why Codex over Gemini

Gemini recommended **Next-Fit-Decreasing with greedy bin closing**
(replace FFD entirely). On the specific production fixture, this
would likely NOT change the 12/25 split because the current FFD
already probes each bin with a full cumulative repack — so items
that "would fit alongside 1-12 on bin-1" are already placed there.
None of the 25 overflow items pass that probe today.

Codex's diagnosis is sharper:

> The 2-bin tail regression is not a packer quality issue but a
> control-flow issue: every existing cross-bin operator uses a
> fixed-layout `bin_fits` oracle that never repacks the receiver
> from scratch, so a saturated receiver always reads as full even
> when a different arrangement of its current items would admit
> more load.

The key insight: bin-packing's MaxRects is greedy. When probed
incrementally (12 items + 1 new), it commits to a layout that
doesn't admit the 13th. But when probed with (12 + 4 new) as a
multi-item set, it may find a different layout that fits 13-14
items total because the expanded demand list changes MaxRects'
section-splitting decisions.

Codex's operator exploits this by repacking the RECEIVER from
scratch with the augmented multiset, not via the fixed-layout
oracle. Gemini's NFD doesn't touch this — it just moves the routing
decision point earlier.

## Algorithm sketch (Commit 1)

1. Take the current `FfdAssignment` (post-FFD + GLS).
2. Select the **tail candidate** = least-loaded non-empty bin (reuse
   `unload_lightest_bin`'s density logic).
3. Build movable source units from the tail candidate's placements.
   Sort by `(top_edge desc, area asc, deterministic keys)`. Top-edge
   targeting is critical: tail height only improves when we remove
   shapes that touch the current top envelope.
4. Evaluate bounded prefixes K ∈ [1, K_MAX=6]. Do not stop at the
   first improvement — larger K may unlock more tail.
5. For each prefix:
   a. Shadow-copy the assignment state.
   b. Remove K units from source (tail candidate).
   c. Add K units to receiver bin.
   d. Repack receiver from scratch via `greedy_rectangle_pack` in
      strategy mode (BSSF → BottomLeft fallback).
   e. Repack source bin too (removing K from top can collapse its
      height substantially).
   f. Reject on any `overflow != 0` from either repack.
6. Score via `TailScore = (closed_bins, tail_height, concentration)`:
   - Accept if `after.closed_bins > before.closed_bins`.
   - Else accept if `after.tail_height > before.tail_height + 0.01`.
   - Else accept if tail ties and concentration improves.
7. Commit transactionally via `assignment_from_state`. On any error
   or timeout, return `Ok(None)` preserving exact original assignment.

## Gating (Commit 1)

- `n_bins == 2` only (production regression shape).
- `overflow` is empty.
- Both bins non-empty.
- Current tail height on the least-loaded bin < 24" (collapsed).
- Local time budget: `min(700ms, remaining_global_budget)`.

## Parity safety

- Fully transactional: shadow state only.
- Requires `overflow == 0` on BOTH touched bins post-repack.
- `after_placed == before_placed` invariant check.
- `assert_per_shape_conservation` debug-mode check.
- On any packer error, timeout, or mismatch → `Ok(None)`.

## Scope

| Component | LOC |
|---|---|
| warm_start strategy seam (BSSF/BottomLeft) | 40-90 |
| `consolidate_tail_bin` operator + helpers | 140-220 |
| Operator ladder hook + budget plumbing | 20-50 |
| Rust unit tests | 80-140 |
| **Total** | **280-500** |

## Commit strategy (from Codex)

- **Commit 1**: Benchable minimal. warm_start seam + operator +
  TailScore + ladder hook + focused tests. Only `BSSF + BottomLeft`
  in the receiver portfolio.
- **Commit 2**: Breadth + guardrails. Add `Auto` fallback under
  deadline, tighter runtime gating, parity-coverage tests, any
  candidate-order tuning from the bench.

Bench after Commit 1 before committing 2.

## Expected improvement

Codex (conservative): Recover most of the 125.63" missing tail.
Fab Score path 46 → likely 50-52 range (Gemini predicted 51-53 but
that was for NFD specifically; effect should be similar).

Confidence: Medium. The mechanism (MaxRects section-splitting
depends on the full demand multiset) is plausible but not
guaranteed to unlock more placements. If Commit 1 doesn't materially
shift the bench, add `Auto` to the portfolio (Commit 2) before
concluding.

## Actual measured result

| Metric | Task 19d baseline | Tier 6 | Legacy |
|---|---:|---:|---:|
| Placed (roll-1 / roll-2) | 12 / 25 | **13 / 24** | 33 / 4 |
| Tail remnant (roll-2) | 0.01" | 0.01" | 125.63" |
| Reusable (sq in) | 14292 | 14293 | 16704 |
| Fab Score | 46 | 46 | 52 |
| Parity suite | 27/27 | 27/27 | — |

**Honest finding:** Tier 6's operator works — it successfully commits
a K=1 move from roll-2 to roll-1. But extending K up to 12 with the
full portfolio (BSSF → BottomLeft → Auto + Multistart) yields no
additional accepted moves. The receiver (roll-1) physically can't
absorb more items in ANY layout bin-packing explores.

**Root cause:** the `bin-packing` crate's heuristic family has a hard
capacity ceiling at ~13 placements on a single 78×396 roll with this
multiset. Legacy's NFP engine fits 33 — that's a strictly stronger
algorithm, not a control-flow difference. Codex's diagnosis ("it's
control flow, not packer quality") was half-right: control flow does
limit small moves (K=1 unlocked). Beyond that, the packer IS the
bottleneck.

## What would close the remaining gap

Three options, all substantial:

1. **Port legacy's NFP engine to Rust** — large effort (1500-2500 LOC
   per Codex's earlier estimate). Highest upside.
2. **Integrate `sparrow`** (JeroenGar, MIT) — state-of-the-art Rust
   nesting solver on top of `jagua-rs` (already a dep). Continuous
   rotation, LNS-based. Gemini's Task 19d report flagged this as
   the "endgame" packer. Much less LOC than a port; integration
   complexity unknown.
3. **Accept the current state** — Rust beats legacy on single-bin,
   parity on 2-bin placement, Fab Score lags by 6 points. Revisit
   when S4 (desktop) needs parity.

## Follow-ups (not in this task)

- Tier 5 (width-pair wrapper) as inner sub-technique inside the same
  operator, gated speculatively.
- Multi-start / randomized restart as a broader complement to Codex's
  targeted operator (Gemini's Tier-2 fallback #1).
- `min_usable_side` bump from 6" to 11.5" (Gemini's observation that
  the current threshold admits long narrow strips as "usable").

## Reports referenced

- `.claude/research/tier6-tail-remnant/codex-report.md` (389 lines)
- `.claude/research/tier6-tail-remnant/gemini-report.md` (200 lines)
- `.claude/research/19d-packer-choice/decision.md` (Task 19d history)
