# Task 19d (Gemini): survey Rust 2D packers that match legacy NFP quality

## Problem

REMA Portal's Rust nesting engine uses `rectangle-pack` 0.4.2 for warm-start
placement. On a real production cut list (37 parts across two 78"×396"
rolls), rectangle-pack ties legacy TS on density (70.55%) but loses badly
on business metrics:

- Reusable offcut: Rust 14365 sq in vs Legacy 16704 (-16%)
- Tail remnant on roll-2: Rust 0.07" vs Legacy 125.63"
- Fab Score: Rust 46/100 vs Legacy 52/100

**Smoking gun**: with a single 78×396 bin, Rust places 12/37 parts while
legacy fits 33/37. That's a 21-part gap — rectangle-pack is structurally
weaker than legacy's NFP-based approach on this workload.

Legacy TS (`nesting/nfp-greedy-placer.ts`) is NFP-based with 36-angle
rotation search + fine/ultra-fine refinement. We want Rust to match or beat
legacy on business metrics while staying fast.

## Your job

Web-research Rust crates and algorithms that could replace or supplement
`rectangle-pack` to close this gap. Deliverable:
`.claude/research/19d-packer-choice/gemini-report.md`, 1500-2500 words.

### Required sections

1. **Algorithmic landscape.** For rectangular 2D bin packing, what are the
   top-tier heuristic families? MaxRects (variants: BSSF, BLSF, BAF, etc.),
   Guillotine (SAS/LAS/SLAS splits), Skyline (NF, BL, WF), shelf packers
   (NFDH/FFDH/BFDH), and NFP-based (for irregular/rotated). Which are
   known-strong on heterogeneous inputs like ours (mix of 120×36 huge
   rects and 2×12 tiny strips)?
2. **Open-source Rust ecosystem survey.** For each candidate, pull the
   latest crate info from crates.io / docs.rs / GitHub:
   - `binpack2d` — MaxRects + Guillotine; MIT
   - `bin_packing` — newer (check release date); broader algorithm set
   - `crunch` — small, supports rotation
   - `cut-optimizer-2d` — Hansen's crate; shelf-like
   - `guillotiere` — texture atlas allocator (note why this is
     probably wrong)
   - `rectangle-pack` — current; deterministic rectpack2D-style
   - `gdrr-2bp` — GPL-3.0; reference only
   - Anything else you find that's relevant (MaxRectsBinPack ports,
     rust-bin-pack, skyline crates, etc.)
   Report for each: last commit date, number of downloads, stars, open
   issues count, rotation support, license, API surface fit for our use
   case.
3. **External reference implementations.** Briefly note `packingsolver`
   (fontanf, C++, MIT — highly-regarded reference), `HEUR2D`, `rectpack`
   Python, and any academic implementations we should study.
4. **Recommendation.** Which crate (or hand-written algorithm from a
   reference) gives the best expected quality-vs-complexity trade-off for
   REMA's workload? Explain the reasoning.
5. **Risk flags.** Any crates that look attractive but have hidden
   issues — abandoned, single-maintainer, non-deterministic, or
   subtly incorrect? Flag them.
6. **Migration sketch.** If we adopt your recommendation, what does the
   drop-in look like in `engine/crates/rema-layout/src/infrastructure/warm_start.rs`?
   Rough LOC + touch points.

### Context you need

- Current packer integration: `engine/crates/rema-layout/src/infrastructure/warm_start.rs`
  function `greedy_rectangle_pack`, called via `greedy_bottom_left`.
- FFD routing: `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`.
- Legacy for comparison: `nesting/nfp-greedy-placer.ts` +
  `nesting/nfp-pack-rotation.ts` + `app/dashboard/cut-planner/_components/nesting-width-pair-packer.ts`.
- Bench: `tools/bench-production/bench.ts`, run via
  `npx tsx tools/bench-production/bench.ts /Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv --bins 1`.
- Codex's earlier report at `.claude/research/tiers-1-5/codex-report.md`
  covered a broader 5-tier landscape; now we're narrowed to just the
  packer replacement question.
- The legacy reference PDF is at
  `/Users/danielmartinezjulio/Downloads/R&S Rubber Cut Plan.pdf` —
  shows 2-shelf layout on roll-1 + preserved 78"×178.8125" remnant on
  roll-2. Not uploaded; just note its existence.

### Constraints

- Must be deterministic (same input → bit-identical output). REMA's
  parity suite depends on it.
- Must be Rust-native or have stable Rust bindings. No C++ FFI unless
  the payoff is massive.
- Licensing: MIT/Apache/BSD strongly preferred. GPL is a blocker.
- Rotation support is likely required to match legacy quality (legacy
  does 36-angle continuous search).
- Performance budget: must finish a 37-part 2-bin pack in < 500ms on
  mid-tier hardware. Legacy runs in ~1s; we want to stay fast.

Don't modify code. Just write the report.
