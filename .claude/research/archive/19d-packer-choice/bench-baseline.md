# Task 19d: packer replacement — bench baseline

**Date**: 2026-04-19
**Status**: research dispatched to Codex + Gemini; awaiting reports.

## Fixture

`/Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv` — 29 unique
parts, 37 total copies, 43581.6 sq in total. Stock: 2× 78"×396" rolls.

## Measured gap (Rust Task 19c vs Legacy)

### 2-bin run (`--bins 2`)

| Metric | Rust | Legacy | Δ |
|---|---:|---:|---:|
| Placed | 37 | 37 | 0 |
| Density | 70.55% | 70.55% | 0 |
| Reusable area (sq in) | 14364.6 | 16703.8 | −2339 |
| Scrap area (sq in) | 4253.7 | 1065.6 | +3188 |
| Tail remnant (roll-2) | 0.07" | 125.63" | −125.56" |
| Fab Score | 46 | 52 | −6 |
| Wall-clock | 87ms | 1004ms | +917 faster |

Per-bin: Rust 12/25 split. Legacy 33/4 split.

### 1-bin run (`--bins 1`) — smoking gun

| Metric | Rust | Legacy |
|---|---:|---:|
| Placed | 12/37 | 33/37 |
| Density | 90.40% | 82.11% |
| Fab Score | 51 | 57 |

**Critical finding**: rectangle-pack cannot fit more than 12 parts in a
single 78×396 bin. Legacy fits 33. This is a packer quality problem,
not a search/scoring/FFD problem.

## What was tried and reverted

All reverted cleanly from `engine/crates/rema-layout/src/infrastructure/warm_start.rs`
(currently at Task 19c baseline).

1. Sort `greedy_rectangle_pack` insertion by bbox area desc — did NOT
   help; still 12/37. Suggests rectangle-pack's split heuristic is
   the real bottleneck, not sort order.
2. Added an incremental wrapper around `BinSection::try_place` with
   skip-on-miss semantics — also 12/37. Same heuristic issue.
3. Hand-rolled MaxRects BSSF (~250 LOC) — placed 13/37. Better Fab
   Score via reusable detection, but still massively behind legacy.
   Suggests simple BSSF alone isn't enough; legacy does something
   structurally different (rotation search + width-pair grouping).

## Legacy's approach (from `nesting/nfp-greedy-placer.ts` + PDFs)

- 2D NFP-based placement with 36-angle rotation search.
- Fine-refine pass (±5° at 1°) on top-2 seeds.
- Ultra-fine pass (±1° at 0.25°) on best.
- Wrapped by `nesting-width-pair-packer.ts` for shelf-like grouping.
- Reference PDF shows legacy preserves 78"×178.8125" tail on roll-2.

## Parity test constraints (must pass post-swap)

`tests/packing/parity/parity.test.ts` — 9 fixtures, strict:
- `rust.placedCount >= legacy.placedCount`
- `rust.overflowCount <= legacy.overflowCount`
- per-bin efficiency within 1%

## Open questions for Codex + Gemini

- Which Rust crate or hand-written algorithm matches legacy's placement
  quality?
- Does rotation support matter (legacy uses 36 angles; our fixture
  seems rotation-insensitive)?
- What's the expected LOC + wall-clock for the migration?
