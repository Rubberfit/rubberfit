# Task 19d: pick a packer that matches legacy on production cuts

## Problem

Task 19c landed `rectangle-pack` as the heterogeneous warm-start packer. On
a 2-bin run it ties legacy on piece count (37/37) and density (70.55%),
but on business metrics it **loses**:

- Reusable offcut: Rust 14365 sq in vs Legacy 16704 (-2339, -16%)
- Tail remnant: Rust 0.07" vs Legacy 125.63" (legacy deliberately preserves
  a full-width tail on roll-2)
- Fab Score: Rust 46/100 vs Legacy 52/100

**The diagnostic**: I reran the bench with `--bins 1` (single 78×396 roll).
Rust places **12/37 parts**. Legacy places **33/37**. That's a 21-part gap
on a single bin. Rectangle-pack is simply not competitive with legacy's
2D NFP-based placer on this workload.

This means: on the 2-bin run, Rust survives only because it has extra bin
capacity to absorb parts legacy would have fit on roll-1. When Rust is
forced to pack tight, it can't. This is a **packer quality** problem, not
a search or scoring problem. Tier 6 (tail-remnant compaction) can't fix
it because roll-1 is already at 396/396" occupied after rectangle-pack
places its 12 big parts.

## Your job

Don't write code. Write a decision memo: which rust-side packer should
REMA adopt as the warm-start base? Deliverable:
`.claude/research/19d-packer-choice/codex-report.md`, 1500-2500 words.

### Required sections

1. **Root cause analysis.** Why does rectangle-pack fit only 12/37 when
   legacy fits 33/37 on the same 78×396 bin? Is it the splitting heuristic
   (rectpack2D-style single-tree splits)? Sort order (insertion order vs
   area desc)? Lack of rotation? Something else?
2. **Candidate packers (Rust)**, for each: license, maintenance, API
   surface, rotation support, expected placement quality vs rectangle-pack
   on our workload. Include at minimum:
   - `binpack2d` (MaxRects + Guillotine; MIT)
   - `bin_packing` (MaxRects/Skyline/Guillotine beam; young; check
     license + recent commits)
   - `crunch` (small, supports 90° rotation)
   - `cut-optimizer-2d` (Hansen; older)
   - `guillotiere` (texture atlas — probably wrong shape but note why)
   - `gdrr-2bp` (GPL-3.0; algorithmic reference only, not a dep)
   - `packingsolver` (C++; reference only)
   - Hand-written MaxRects BSSF (~200-300 LOC; I started this and reverted
     — be honest about whether this is worth the maintenance vs a crate)
3. **Recommendation**. Primary pick + ranked alternatives. Be concrete
   about what trade-offs we accept.
4. **Expected improvement**. For the recommended packer, predict: parts
   placed on 78×396 single bin (vs legacy's 33), tail-remnant preservation
   on the 2-bin case, Fab Score delta.
5. **Migration plan**. How to drop it into `greedy_bottom_left`
   (`engine/crates/rema-layout/src/infrastructure/warm_start.rs:55`)
   replacing the rectangle-pack call, without regressing the parity suite
   (`tests/packing/parity/parity.test.ts`).
6. **Scope**. LOC estimate + wall-clock time for a careful engineer.

### What I already tried (and failed)

Don't repeat these. All reverted now.

- Extended `greedy_bottom_left` to fall back on an "incremental" wrapper
  that replayed rectangle-pack's `BinSection::try_place` one rect at a
  time with skip-on-miss semantics. Fit the same 12.
- Sorted `greedy_rectangle_pack`'s insertion order by bbox area desc
  (bug: FFD passes items alphabetically by shape_id, so rectangle-pack
  was iterating AA11 first). Fit the same 12. The insertion-order issue
  is real but not the core gap — rectangle-pack's split-tree simply
  fragments heterogeneous inputs too aggressively.
- Hand-wrote a MaxRects BSSF packer (~250 LOC) inside `warm_start.rs`.
  Placed 13/37 (one extra vs 12). Better Fab Score via reusable detection
  but still massively behind legacy's 33. This suggests my BSSF
  implementation has a subtle bug, OR BSSF alone isn't enough — legacy
  must be doing something structurally different (rotation, shelf-based
  packing, multi-pass).

### Files to read

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current
  rectangle-pack integration (Task 19c).
- `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`
  — how items are routed to bins (FFD with `greedy_bottom_left` probe).
- `nesting/nfp-greedy-placer.ts` + `nesting/nfp-pack-rotation.ts` — legacy
  TS packer (it's NFP-based with 36-angle rotation search).
- `app/dashboard/cut-planner/_components/nesting-width-pair-packer.ts` —
  legacy's width-pair shelf grouping logic.
- `tools/bench-production/bench.ts` — the single-bin + 2-bin benchmark.
- `.claude/research/tiers-1-5/codex-report.md` — your earlier report on
  tiers 1-5 (tail remnant, Fab Score, etc.). You wrote it; reference
  your own reasoning where useful.
- `.claude/research/tiers-1-5/gemini-report.md` — Gemini's view.

### Two data points you should remember

1. **Legacy TS is NFP-based with 36-angle rotation search.** It's likely
   MUCH heavier compute than rectangle-pack (bench: legacy 942ms vs Rust
   87ms on 2-bin run). Any Rust packer that closes the gap probably
   needs rotation support + a smarter splitting strategy.
2. **Legacy packs 33 in 388.5" of a 396" roll, preserving a 7.5" tail.**
   It's also 2-row-shelf-like: G-family on top shelf, small parts filling
   bottom shelf gaps. See the reference PDF at
   `/Users/danielmartinezjulio/Downloads/R&S Rubber Cut Plan.pdf`.

Be strict about business value vs engineering scope. If the honest
answer is "port legacy's NFP algorithm to Rust, ~2000 LOC", say so.
If "drop in `binpack2d`, it's a 100-line adapter that fits 28 parts",
say that.
