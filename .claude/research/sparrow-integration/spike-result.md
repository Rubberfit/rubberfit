# Sparrow spike — Commit 1 result + kill signal

**Date:** 2026-04-19
**Parent docs:** `sparrow-spike-design.md`, `sparrow-spike-plan.md`, `next-session-sparrow-spike.md`.
**Commit:** Commit 1 of 2 (Design C — outer-loop item-count shrink, with shrink-only + "drop smallest" for the MVS).

## TL;DR

**The spike did NOT improve single-bin density on the production 37-part fixture.** At every starting N from 14 through 33, across multiple budget regimes (500ms → 30s per attempt), the repack returned the BSSF baseline of 13 placements. The kill criterion triggers. The gap vs legacy's 33 placements cannot be closed with the current BPP-shaped sparrow port.

## What shipped (still useful)

- `fixed_bin_sparrow_repack(bin, items, clearance, config)` in
  `engine/crates/rema-layout/src/infrastructure/search/mod.rs`.
- `FixedBinRepackConfig` struct.
- `build_overlap_seed` helper (BSSF feasible base + top-of-bin forced extras).
- `run_repack_attempt` helper (inlines the explore → compress pipeline but
  surfaces the raw feasibility verdict).
- 5 unit tests in `search::tests::fixed_bin_repack_*`. All pass.
- Production-fixture bench under
  `engine/crates/rema-layout/tests/sparrow_repack_bench.rs` (marked
  `#[ignore]`; run with `--ignored --nocapture`).

The scaffolding is correct and well-tested on small fixtures. It simply
cannot lift density on the production fixture because the underlying
mechanism is architecturally limited — see root cause below.

## Measurement data

Production bench (revised_sizes_rev1.csv, 29 parts × 37 copies, 78×396 stock):

| Config | Placed | Total loss (best attempt) | Runtime |
|---|---:|---:|---:|
| BSSF baseline | 13 | — | 0.3ms |
| Sparrow start=14, 30s single attempt | 13 | 212 | 15s |
| Sparrow start=15, 30s | 13 | 1793 | 30s |
| Sparrow start=20, 10s | 13 | 13533 | 8.8s |
| Sparrow start=25, 2s × 8 shrinks | 13 | — | 10s |
| Sparrow start=30, 10s × 8 shrinks | 13 | 23826 | 10s |

Even at N=14 (BSSF+1 forced item) with 30s to resolve ONE overlap, total
collision loss stayed positive. The mechanism returned the BSSF fallback
in every configuration.

## Root cause — confirmed architectural, not tuning

The ported GLS cannot increase density on a single bin. This is documented
in the port's own integration tests:

- `engine/crates/rema-layout/tests/gls_integration.rs:16-23`:
  > *"Codex proved on Task 8 that Separator preserves cardinality
  > (separator.rs:390) and compress is identity (compress.rs), so density
  > is invariant on the single-bin path. Asserting density-lift would be
  > trivially true or wrong."*

The architectural flow:

1. `SeparatorWorker::move_items` (`gls/separator.rs:445-455`) only visits
   items with `ct.get_loss(pk) > 0.0`. Zero-collision items are filtered
   out and cannot be moved.
2. `exploration_phase::disrupt_solution` does a swap-two-large +
   relocate-contained pass. This CAN move items with zero loss, but it's
   only a structural perturbation — it doesn't fundamentally re-pack.
3. Critically: there is NO add/remove item operator in the port. Upstream
   sparrow's SPP algorithm relies on its outer strip-shrink loop (not
   ported because REMA is BPP). That loop is what creates the iterative
   densification pressure.

**Consequence:** the port is a collision resolver, not a packer. Given a
feasible starting layout with N items, it returns a valid arrangement
for N items. It cannot return an arrangement with more than N items. It
cannot rearrange N items to make room for the (N+1)th. On a fixture like
the production 37-part case — where BSSF is already 91% dense and the
free space is 10 small disconnected rects — there's no room for a new
item without MOVING BSSF's items, which the separator refuses to do.

Even the "chaotic all-overlap" starting state fails, because while every
item then has loss > 0 and is movable, they all want the SAME limited
valid positions; the LNS pool + disrupt machinery in `exploration_phase`
is not strong enough to explore the combinatorial space of densities
above 91% on this input in under a minute.

## Why Gemini's Design E (incremental add-and-resolve) would also fail

Same architectural reason: adding item K to a feasible (K-1)-layout
requires a valid position for K. If the valid position requires moving
items 1..K-1, separator can't do it (those items have zero loss).
Design E has the same ceiling as Design C on dense fixtures.

## Recommendation — stop the spike

Do not pursue Commit 2 (Design E). It will hit the same architectural
wall. The next productive step is one of:

1. **Port legacy's NFP engine to Rust.** Per Codex's earlier estimate:
   1500-2500 LOC. Highest upside (matches legacy's 33). Straight-line
   work with a known-good reference.
2. **Port upstream sparrow's FULL LNS ruin-recreate, not just the separator.**
   Per Codex's sparrow scoping report: 900-1400 LOC for full heterogeneous
   warm-start replacement. Requires implementing `insert_item` and
   `remove_item` on the BPP layout so density can actually change.
   Uncertain whether sparrow's SPP-centric escape heuristics translate.
3. **Accept the current state.** Rust wins on single-bin Fab Score (71 vs
   57), parity on 2-bin placement (37/0 vs 37/0), and loses 2-bin Fab
   Score by 6 points (46 vs 52). Revisit when S4 (desktop) needs parity.

My read: option 1 is the pragmatic next step if business wants legacy
parity. Option 3 is rational if the Fab Score delta is acceptable.
Option 2 only makes sense if the upstream sparrow fork is expected to
pay off on OTHER fixture shapes (e.g., future jobs with more
homogeneous items, where LNS might actually beat MaxRects).

## What to do with the shipped `fixed_bin_sparrow_repack`

Options:
- **Keep it** as latent infrastructure. If option 2 above is ever pursued,
  the overlap-seed builder and attempt runner are reusable. The function
  doesn't currently hurt anything: it's a standalone pub fn, not wired
  into any call site. Cost = ~300 LOC of dead code + 5 unit tests.
- **Revert it** once option 1 or 3 is chosen. Minimizes attack surface.

Deferring this decision to the follow-up session that picks the next path.

## Files touched this commit

- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` (+ ~320 LOC spike + 5 tests)
- `engine/crates/rema-layout/tests/sparrow_repack_bench.rs` (+ new, 115 LOC `#[ignore]`d bench)
- `.claude/research/sparrow-integration/spike-result.md` (this doc)
- `.claude/handoff/sparrow-spike-design.md` (referenced, from earlier in session)
- `.claude/handoff/sparrow-spike-plan.md` (referenced, the dual sign-off doc)
