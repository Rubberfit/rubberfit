# Sparrow integration scoping — Gemini

## Context

REMA Portal's Rust nesting engine has closed most of its gap to
legacy TS, but one hard ceiling remains: `bin-packing` 0.3.0's
MaxRects heuristic family can only fit ~13 parts on a single 78×396
roll from our production 37-part multiset. Legacy's NFP engine fits
33. Tier 6 confirmed this is a packer-quality ceiling, not control
flow.

You flagged sparrow (JeroenGar) in your Task 19d Rust-packer-ecosystem
report as "the endgame" packer. Time to scope it.

## Your job

Web-research + decide: is `sparrow` (https://github.com/JeroenGar/sparrow)
the right next step to close the packer ceiling? Deliverable:
`.claude/research/sparrow-integration/gemini-report.md`, 1500-2500
words.

### Required sections

1. **Sparrow today.** Latest release, maintenance state, last commit,
   paper / preprint it's backed by (arxiv id), license, how widely
   used. If it's a research codebase only, say so.
2. **Problem family.** Sparrow's README bills it as strip-packing
   (SPP) — single container, minimize length. REMA's problem is BPP
   (bin packing, multiple containers with tail preservation). Does
   sparrow handle BPP directly, or do we need to wrap it to route
   items to multiple bins?
3. **Comparison vs legacy TS NFP.** Legacy uses NFP + 36-angle
   rotation search + fine-refine. Sparrow uses LNS + continuous
   rotation + sampling-based collision (jagua-rs). Which should
   fit more parts on the 78×396 single-bin diagnostic?
4. **Rust API surface.** Does sparrow expose a library crate we can
   depend on? Or is it a research binary that we'd need to fork /
   extract algorithms from? If the latter, how invasive?
5. **jagua-rs overlap.** We already depend on `jagua-rs` 0.7.1
   (features = ["bpp"]) for our existing sparrow GLS port (S2.5
   Tasks 5-13). Does sparrow just sit on top of jagua-rs, or does
   it vendor its own layout primitives? Any duplication?
6. **Expected improvement on the fixture.**
   - Single-bin bench: we currently fit 13/37 at Fab 71. Legacy fits
     33/37 at Fab 57. What do you project sparrow fits?
   - 2-bin bench: we're at 13/24 split, Fab 46. Legacy is 33/4, Fab
     52. What do you project sparrow does?
7. **Risks.** Determinism, runtime, memory, API stability, parity.
   Anything that would block our parity suite from passing.
8. **Recommendation.** Go / no-go. If go: concrete steps (dependencies
   to add, files to change, tests to write). If no-go: what's the
   right alternative?

### Constraints (same as previous tasks)

- Deterministic (same input → bit-identical output).
- MIT/Apache/BSD license only.
- Runtime budget: ≤ 1500ms for 37-part 2-bin job.
- Must not regress the 27 parity fixtures.

### Files to read

- `engine/crates/rema-layout/Cargo.toml` — current deps.
- `engine/crates/rema-layout/src/infrastructure/jagua_adapter.rs` —
  current jagua integration.
- `engine/crates/rema-layout/src/infrastructure/search/gls/*.rs` —
  our earlier sparrow GLS port (SPP-focused).
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` —
  current bin-packing integration target for replacement.
- `.claude/research/tier6-tail-remnant/decision.md` — why we need a
  different packer family.
- `.claude/research/19d-packer-choice/gemini-report.md` — your earlier
  ecosystem survey where you flagged sparrow.

No code changes. Just the report.
