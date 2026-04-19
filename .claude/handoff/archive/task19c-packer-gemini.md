# Task 19c packer crate evaluation — Gemini

## Context

REMA Portal Rust nesting engine. S2.5 shipped (`s2.5c-production-ready`), but a benchmark on real production data revealed a big gap:

- **Rust placed 8 of 37 pieces at 44% density.**
- **Legacy TS placed 37 of 37 at 70.5% density (theoretical max).**
- Input: 29 unique rectangle part types, 2× 78"×396" rolls, heterogeneous sizes.

Root cause: `warm_start::greedy_bottom_left` has a 1D vertical-stacker fallback for heterogeneous inputs (Task 19a only added 2D grid for homogeneous single-part cases). For real heterogeneous cut lists, Rust leaves half the roll empty.

We need a **2D heterogeneous rectangle packer with rotation support** to replace that stacker. Separately we want a **maximal empty rectangle analysis** for Task 19d (reusable-offcut-aware lex score — a business-critical metric that legacy nails: 27.2% reusable offcut vs 2.3% waste on the benchmark job).

User's anxiety: they spent 2 months on the TS packer and the code was buggy. They're migrating AWAY from writing this from scratch. Want to use a proven open-source crate.

## My initial recommendation (for you to stress-test)

**Primary: `guillotiere`** (https://github.com/nical/guillotiere, MIT/Apache)
- Ships in Firefox production (texture atlas).
- Guillotine-cut 2D allocation — matches physical fabric/rubber cutting semantics.
- Exposes a free-rectangle list we can use for reusable-offcut analysis.
- Rotation supported.
- i32 coords — we already do fixed-point scaling via `RemaScale` in `rema-geom`.

**Alternative: `rectangle-pack`** (https://github.com/chinedufn/rectangle-pack, MIT)
- Multi-bin from day 1.
- Multiple heuristics (MAXRECTS + skyline), picks best.
- Pure Rust, no C FFI.
- Sprite atlas lineage.

## Your assignment

Evaluate these two (and anything else you know of) for our specific use case. Write `.claude/research/task19c-packer/gemini-report.md`.

Concrete questions:

1. **Which packer best matches our workload?** Inputs are:
   - Large bins (78"×396" fabric rolls, not tiny texture atlases).
   - Heterogeneous rectangles with quantities (1-5 per shape, ~30 unique shapes).
   - Rotation allowed (fabric with no grain constraint).
   - 2-5 bins typical (1-2 for small jobs, up to 5 for large jobs).
   - Needs to produce HIGH density (target: match legacy's 70%).
   - Needs to produce LARGE contiguous offcuts (target: 27% reusable vs 2-3% waste split).

2. **Other crates to consider?** The full Rust 2D packing ecosystem — `crunch-rs`, `etagere`, `texture_packer`, `image_atlas`, `binpack`, `rectangle_pack`, etc. Any mature alternatives I missed?

3. **Guillotine vs non-guillotine for fabric cutting.** Does "all cuts must be straight lines across the full sheet" actually match how fabric/rubber is cut? Or can humans do L-cuts with a knife? If guillotine is genuinely required, that's a free argument for `guillotiere`. If not, a non-guillotine packer may pack tighter.

4. **License fit.** `guillotiere` is MIT/Apache, `rectangle-pack` is MIT. Both compatible with our engine. Any other license concerns for these or alternatives?

5. **Integration effort estimate.** For the top recommended crate, roughly how many LOC of integration in our `warm_start::greedy_bottom_left` (currently ~200 LOC)? We keep the same public signature (dispatcher pattern from Task 19a).

6. **Offcut analysis approach.** For Task 19d's reusable-vs-scrap metric, can we use `guillotiere`'s internal free-rect list? Or do we need a separate maximal-empty-rectangle pass after packing?

## Deliverable

`.claude/research/task19c-packer/gemini-report.md`, aim 800-1500 words.

Structure:
1. Recommended crate + why
2. Alternatives considered + why rejected
3. Guillotine-vs-non-guillotine call for our domain
4. Offcut analysis strategy
5. LOC estimate + integration risks
6. Verdict: ready-to-build / needs-more-research

Read first:
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — current packer implementation.
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs` — how lex metric works; relevant for Task 19d.
- `engine/crates/rema-geom/src/infrastructure/clipper.rs` — existing pattern for scaling f64 → i32 coords via RemaScale.
- `tools/bench-production/bench.ts` — the benchmark tool.
- `engine/crates/rema-layout/Cargo.toml` — current deps (jagua-rs 0.7.1 is the main one).

Don't modify code.
