# Tiers 1-5: make Rust engine BEAT legacy — research (Codex)

## Context

Task 19c just landed. Verified result on `/Users/danielmartinezjulio/Downloads/revised_sizes_rev1.csv`:

- Rust 37/37 at 70.55% density, 298ms.
- Legacy 37/37 at 70.55% density, 344ms.
- Zero gap on placement + density. Rust 13% faster.

User now wants Rust to BEAT legacy on business metrics. Five tiers proposed:

1. **Reusable offcut maximization** — legacy's PDF shows 27.2% reusable / 2.3% waste split (deliberately preserves a 78×178" remnant). Rust doesn't optimize for this.
2. **GLS refinement verification** — Task 18 found operators dormant on synthetic fixtures; need to check real production data.
3. **Rotation wrapper** — rectangle-pack 0.4.2 doesn't implement rotation.
4. **Fab Score** — legacy UI reports `Fab Score: 74/100`; we don't have the formula or a proxy.
5. **Pattern-family pre-pass** — group identical shapes, place as blocks first.

Gemini is doing parallel research at `.claude/research/tiers-1-5/gemini-report.md`. You write `.claude/research/tiers-1-5/codex-report.md` — implementation-focused second opinion. Be strict on which tiers actually deliver business value vs which look shiny but don't move the needle.

## Your job

Stress-test each tier's ROI. Flag the ones that aren't worth the code. Find any tier the user didn't list but should have.

### Tier-level questions (your version)

**Tier 1 — Reusable offcut**

- Computing "maximal empty rectangle" (MER) inside a polygon with obstacles is a classical CS problem. O(n²) algorithms exist; O(n log n) with plane sweep. Are any mature Rust crates ready? Or do we hand-roll on top of Clipper's boolean diff?
- Does extending the lex score with `reusable_offcut_area` actually cause the existing operators (swap_two, migrate, unload_lightest_bin) to produce better outcomes? Or does it only affect the initial rectangle-pack seed — which has no score input?
- If the seed is produced by rectangle-pack and GLS operators can't improve it, how does a new score term help? Does it need a new operator specifically for remnant consolidation?
- **Hardest question:** is reusable-offcut optimization compatible with the rectangle-pack algorithm at all? Rectangle-pack is about FITTING shapes, not about shaping the leftover. We may need to run rectangle-pack first, then re-apply an "offcut-consolidation" pass that moves pieces.

**Tier 2 — GLS verification**

- Add a log line at `optimize_multi_with_hooks` boundary: how many rounds ran? How many operator commits? What was density before/after?
- If GLS IS dormant on production too: it's because rectangle-pack already hits the local optimum. That's expected — sparrow's GLS was designed for IRREGULAR shape packing, and our current path is all rectangles. The GLS should NOT be doing work on rect-only inputs; it's compute that's wasted.
- **Honest take:** this tier may just confirm that GLS is irrelevant for REMA's rectangle-dominated workload. Is it worth even instrumenting?

**Tier 3 — Rotation wrapper**

- On the specific production CSV every part fits naturally. Is there a subset of parts where rotation genuinely helps?
- Implementation options: (a) try both orientations in warm_start per part; (b) 2x pass with rectangle-pack and keep best; (c) richer per-part decision (rotate if w > h and bin is taller than wide).
- If rectangle-pack 0.4.2 is stale, do we fork/vendor it and actually implement rotation upstream? Or layer rotation externally?

**Tier 4 — Fab Score**

- We don't have the formula. What are reasonable guesses?
- Is it worth implementing if we're guessing? Or request from user / reverse-engineer from their codebase?
- **My concern:** if Fab Score is what the customer sees in reports, it's a reporting-layer thing, not an engine-layer thing. Putting it inside the acceptance metric means the engine optimizes for a display value rather than an intrinsic business metric. That's backwards.

**Tier 5 — Pattern-family pre-pass**

- Identical-shape grouping exists in rectangle-pack via its Group feature. Does using Groups improve density vs ungrouped?
- What about NEAR-identical shapes (e.g., 10×10 and 10.0625×10)? Group them or treat independently?
- Risk: pattern-family pre-pass essentially overrides rectangle-pack's own volume-sort heuristic. If rectangle-pack is already good, we make it worse.

### Cross-cutting concerns (your sharp edges)

1. **Tier ordering logic.** Does Tier 2's answer change how we approach Tier 1? E.g., if GLS is dormant, reusable-offcut can ONLY come from warm_start or a post-pack move pass, not from the operator ladder.
2. **Re-benchmarking discipline.** We need a reusable:waste bench measurement BEFORE any of these tiers lands, so we know our current split. Otherwise we can't measure improvements.
3. **Algorithm choices under tight review.** For each tier, what's the most PROVEN open-source option vs what's novel code?
4. **Scope bloat.** How much LOC per tier realistically? User said "do tier 1 thru 5" but if total scope > 2000 LOC we should push back.
5. **Missing tier 6+**: any tier the user didn't list that's higher ROI than tiers 3-5? E.g., different warm_start algorithms entirely (not rotation, but different packer family)?

### Open-source survey (cross-tier)

For each of these problem domains, survey what exists in Rust:

- Maximal empty rectangle / largest inscribed rectangle given obstacles.
- 2D shape packing with rotation.
- Group-aware packing.
- Post-pack layout rewriting (move-based optimization).
- Offcut management / remnant tracking.
- Sheet cutting / guillotine optimization (commercial-grade).

Name specific crates with maintenance status + license. If we'd need to port something from C++/Python, name the upstream.

## Deliverable structure

`.claude/research/tiers-1-5/codex-report.md`, ~2500-4000 words.

1. Executive summary (verdict per tier, 100 words).
2. Strict per-tier ROI analysis — go / no-go / modify.
3. Open-source survey for each tier.
4. Sharp edges + correctness concerns.
5. Dependency graph between tiers.
6. Scope estimate (LOC) per tier.
7. Missing tiers the user didn't think of.
8. Recommended implementation ordering.
9. Verdict.

Be strict. Same level as your 19c rotation catch (you caught that guillotiere and rectangle-pack both advertise rotation without implementing it). We need that same skepticism applied to these five tiers.

### Files to read first

Same as Gemini:
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs`
- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`
- `engine/crates/rema-layout/src/infrastructure/search/multi.rs`
- `engine/crates/rema-geom/src/infrastructure/clipper.rs`
- `tools/bench-production/bench.ts`
- `docs/superpowers/benchmarks/2026-04-18-s2.5-results.md`
- `CLAUDE.md`

Plus (Codex-specific):
- `engine/crates/rema-layout/src/infrastructure/search/gls/separator.rs` (the GLS internal loop — for Tier 2 instrumentation questions).

Do not modify code.
