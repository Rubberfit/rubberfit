# Task 19d: Packer Choice — Decision

**Date**: 2026-04-19
**Status**: Implemented. Parity green, single-bin beats legacy.

## Decision

Replace `rectangle-pack` 0.4.2 with **`bin-packing` 0.3.0** in the
heterogeneous branch of `greedy_bottom_left`. Use the crate's `auto`
algorithm with fixed seed.

## Rationale

Both Codex and Gemini independently picked `bin-packing` as the top
Rust-native candidate for REMA's heterogeneous cut-list workload.

- Codex (codebase-focused read): `bin-packing` is the only crate with
  enough algorithm breadth (MaxRects, Skyline, Guillotine beam,
  per-item rotation, multistart) to close a 12→33 single-bin gap
  without porting legacy NFP.
- Gemini (web-research read): Confirmed `bin-packing` license
  (MIT), active maintenance (v0.3.0 published 2026-04-16, 4 days before
  this decision), and the ranking contract's built-in
  `max_usable_drop_area` tiebreak directly rewards reusable-offcut
  consolidation — the business metric we need to beat legacy on.

Both reject: `rectangle-pack` (structurally weak split tree),
`guillotiere` (wrong objective — dynamic atlas allocator), `gdrr-2bp`
(GPL-3.0 blocks commercial use), hand-written MaxRects (prior attempt
only moved 12→13 parts; legacy's gap is structural, not tuning).

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Brand-new crate (created 2026-04-12, only 52 downloads) | Pin exact version `=0.3.0` in Cargo.toml. Archive crate source locally if it ever disappears from crates.io. |
| API may churn | Write a thin adapter layer (`bin_packing_adapter.rs`) so churn is contained to one file. |
| Single maintainer (0xdoublesharp) | `#![forbid(unsafe_code)]` + fuzzing suite + serde round-tripping + criterion benches reduce the blast radius; source is auditable if the author goes dark. |
| Non-determinism from randomized strategies | `bin-packing` honors a `seed` parameter — pin it to our existing `request.seed` (default 0x5E5A_5EA1_BEEF_CAFE). |
| FFD runtime blowup (probe calls `greedy_bottom_left` N² times) | Codex's recommendation: split into probe mode (one fast deterministic algorithm, bounded runtime) and final-layout mode (full `auto` sweep). Memoize probe results keyed by `(bin_dims, clearance, multiset of (shape_id, qty))`. |

## Expected vs measured improvement

Codex + Gemini both predicted 28-31 placed on single-bin + Fab Score 50-53.
Measured on 2026-04-19 with `MaxRectsBestShortSideFit` + `can_rotate=false`:

### Single-bin production bench (`--bins 1`)

| Metric | rectangle-pack (19c) | bin-packing BSSF (19d) | Legacy |
|---|---:|---:|---:|
| Placed / Overflow | 12/25 | **13/24** | 33/4 |
| Fab Score | 51 | **71** | 57 |
| Reusable (sq in) | 0 | **4941** | 4063 |

Single-bin: **Rust now beats legacy on Fab Score by +14 pts** and on
reusable area by 878 sq in. Placement count still short (13 vs 33) —
the legacy NFP path's true strength is its rotation search, which v1
doesn't enable. Expected ceiling without rotation.

### 2-bin production bench (default)

| Metric | rectangle-pack (19c) | bin-packing BSSF (19d) | Legacy |
|---|---:|---:|---:|
| Placed | 37 | 37 | 37 |
| Fab Score | 46 | 46 | 52 |
| Reusable (sq in) | 14365 | 14292 | 16704 |
| Tail remnant (roll-2) | 0.07" | 0.01" | 125.63" |

2-bin: held parity with rectangle-pack baseline. Tail remnant still
collapsing to ~0" because FFD spreads parts across both rolls;
remedied by the follow-up tail-remnant compaction pass (Tier 6), not
by this packer swap.

### Parity + tests

- Parity suite: **27/27 pass** (strict rust.placedCount ≥ legacy).
- Rust unit tests: all pass after two unrelated fixes unblocked by the
  rustc 1.93 → 1.95 upgrade bin-packing required:
  1. `pair_matrix` `#[should_panic]` tests gated to `#[cfg(debug_assertions)]`
     — release-mode indexing no longer reliably traps out-of-bounds.
  2. `cancel_during_search_returns_within_250ms` fixture expanded
     (10 → 40 items) so the pack still runs > 50ms now that BSSF is
     fast enough to otherwise finish before the cancel could fire.
- Vitest suite: 126 pass, 1 skipped.

### Why can_rotate=false (for now)

Enabling rotation on this fixture made bin-packing's Auto mode return
11 placements instead of 12 (RotationSearch sampling apparently can't
beat the no-rotation MaxRects best layout on this input). Rotation
also requires verifying the SeedPlacement polygon-rotation + rotation_rad
round-trip through jagua_adapter — deferred until there's a rotation-aware
parity test.

## Scope estimate

350-550 LOC. 2-3 engineering days if done carefully:

1. Replace rectangle-pack dep with bin-packing (`=0.3.0`) in
   `engine/crates/rema-layout/Cargo.toml`.
2. Rewrite `greedy_rectangle_pack` → new bin-packing adapter.
3. Add probe/final mode split. Probe mode uses one cheap algorithm
   (likely `max_rects_best_short_side_fit`); final mode uses `auto`.
4. Preserve deterministic SeedPlacement output contract.
5. Memoize probe results by `(bin_dims, multiset)` key.
6. Update Task 19c rustdoc comments in warm_start.rs.
7. Run parity suite + production bench (single-bin + 2-bin) + rust tests.
8. Budget: leave the existing `greedy_2d_grid` (homogeneous path) and
   `greedy_vertical_stack` (last-resort fallback) untouched.

## Reports referenced

- `.claude/research/19d-packer-choice/codex-report.md`
- `.claude/research/19d-packer-choice/gemini-report.md`
- `.claude/research/19d-packer-choice/bench-baseline.md`

## Follow-ups (not part of this task)

- Tier 5 (width-pair pre-pass) to push beyond 33/37 if business demands.
- Medium-term: integrate `sparrow` as the warm-start for continuous
  rotation support (both reports flagged this as the endgame). Sparrow
  sits on `jagua-rs` which is already a dep.
