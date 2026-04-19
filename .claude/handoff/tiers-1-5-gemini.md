# Tiers 1-5: make Rust engine BEAT legacy — research (Gemini)

## Context

REMA Portal Rust nesting engine just shipped Task 19c (`rectangle-pack` integration). Verified result on real production cut list:

- **Rust: 37/37 placed, 70.55% density, 298ms wall-clock.**
- **Legacy TS: 37/37 placed, 70.55% density, 344ms wall-clock.**
- **Parity: exact match on placement + density. Rust 13% faster.**

Now user wants to make Rust **BETTER than legacy** on business metrics. Five tiers, ordered by expected business impact:

1. **Reusable Offcut Maximization (Task 19d).** Legacy's PDF shows deliberate concentration of pieces to leave a 78×178" remnant intact. Legacy reports 27.2% reusable / 2.3% waste split. Rust doesn't yet optimize for remnant quality.
2. **GLS refinement verification.** We ported sparrow GLS (Tasks 5-13) but Task 18 showed operators returning Ok(None) on synthetic fixtures. Need to verify whether GLS actually lifts density on real production fixtures or if it's dormant there too.
3. **Rotation wrapper.** rectangle-pack 0.4.2 doesn't implement rotation (has `TODO: Implement rotations`). Some heterogeneous jobs benefit from 90° rotation tries per part.
4. **Fab Score as objective.** Legacy reports `Fab Score: 74/100` — a composite metric we don't replicate. If we mirror it as the engine's acceptance criterion, engine directly optimizes for what legacy's UI reports.
5. **Pattern-family pre-pass.** Production CSV has 3× G1 (identical dims). rectangle-pack treats them independently. Grouping + family-block placement first could lift density 1-3%.

## Your assignment

Write `.claude/research/tiers-1-5/gemini-report.md`. Research OPEN SOURCE options for each tier and recommend a path. Aim ~2500-3500 words total.

### Per-tier research questions

**Tier 1 — Reusable Offcut Maximization**

- What's the theoretical approach? "Maximal empty rectangle" (MER) from computational geometry? Largest inscribed rectangle in a polygon (Clipper-backed)?
- Any open-source Rust crates for MER? `mer-rs`, `empty_rectangle`, Clipper-based helpers?
- How should the lex score extend? Current: `(closed_bins, concentration)`. Proposed addition: `reusable_offcut_area = sum of free rectangles ≥ threshold`. Does that work with the existing cross-bin swap operators in `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`?
- User's CLAUDE.md says 11.5×12" or 6×24" are REMA thresholds. Should threshold be user-configurable or material-specific?
- What's the expected business metric improvement? "From 27% reusable to X% reusable"?

**Tier 2 — GLS refinement verification**

- S2.5 Task 18 found operators return `Ok(None)` immediately on synthetic fixtures because FFD's initial assignment is already at Pareto ceiling.
- On a production 37-part heterogeneous fixture, does GLS actually have headroom? How do we instrument this cheaply?
- If GLS is dormant: what's the fix? Richer lex score (covered by Tier 1)? Different acceptance criteria?
- Specifically: after rectangle-pack produces the seed, does sparrow's Separator actually improve it, or does it exit immediately?

**Tier 3 — Rotation wrapper**

- Open source: any crate that wraps rectangle-pack with rotation support? Or do we build it?
- Algorithm: per-part, try both `(w,h)` and `(h,w)`; which orientation choice — pack twice and keep best, or heuristic pre-sort?
- Deterministic tiebreak when both orientations fit equally.
- Does it matter on REMA's fabric cut lists? The production CSV has all parts fitting naturally; when would rotation actually help?

**Tier 4 — Fab Score as objective**

- We don't have the legacy Fab Score formula. Options:
  1. Ask the user to share the formula.
  2. Reverse-engineer from the PDF (74/100 on a job with 27.2% reusable / 2.3% waste / 70.5% density).
  3. Propose our own Fab Score that matches intent (material efficiency + reusable yield + cut complexity).
- If we have a Fab Score metric, how do we OPTIMIZE for it? Is it a monotone function we can use as lex score tiebreaker?

**Tier 5 — Pattern-family pre-pass**

- Algorithm: detect parts with identical (or near-identical) bbox dimensions → group → place as a family-block first (e.g., 3× G1 becomes a 3-column strip at the start of roll-1).
- Open source: any Rust crates that do "shape family" pre-sorting? Or is this custom logic on top of rectangle-pack?
- Risk: might conflict with rectangle-pack's internal heuristic (it already sorts by volume). If pre-grouping makes things worse, we shouldn't do it.

### Cross-cutting questions

1. **Ordering.** Should these 5 tiers be done sequentially, or can some be parallelized?
2. **Testing strategy.** Each tier needs a way to measure its incremental contribution. How do we avoid regression on synthetic fixtures?
3. **Dependencies.** Any mandatory ordering (e.g., Tier 1 must land before Tier 4)?
4. **Open-source survey across the board.** Any Rust or rust-compatible crates we haven't considered that address multiple tiers? (E.g., some commercial nesting libraries have open-source cores.)
5. **Scope estimates.** Per-tier LOC + wall-clock time for one engineer.
6. **Risk flags.** Any tier where the business value is overstated and we should de-prioritize?

## Deliverable structure

`.claude/research/tiers-1-5/gemini-report.md`:

1. Overview + recommended ordering.
2. Tier 1 — reusable offcut: algorithm, crates, score extension, scope.
3. Tier 2 — GLS verification: how to instrument, expected findings, fix paths.
4. Tier 3 — rotation wrapper: build vs buy, algorithm, scope.
5. Tier 4 — Fab Score: reverse-engineer plan, lex integration.
6. Tier 5 — pattern-family: algorithm, risk vs reward.
7. Open-source crate survey (across all tiers).
8. Scope + timeline table.
9. Verdict: go-no-go per tier.

## Files to read first

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` (just-landed Task 19c integration).
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs` (current lex score + operators).
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs` (orchestrator).
- `engine/crates/rema-geom/src/infrastructure/clipper.rs` (boolean geometry helpers).
- `tools/bench-production/bench.ts` (current bench harness; needs extension for reusable:waste split).
- `docs/superpowers/benchmarks/2026-04-18-s2.5-results.md` (Task 18 tuning findings).
- `CLAUDE.md` (REMA thresholds for reusable offcuts).

Don't modify code.
