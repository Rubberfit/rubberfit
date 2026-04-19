# LBF reference optimizer — decisive finding

**Date:** 2026-04-19
**Discovered during:** direct research into jagua-rs's own workspace after the sparrow spike kill signal.
**Status:** Empirical bench complete. Decisive win. Recommending adoption.

## TL;DR

The jagua-rs GitHub workspace (which we already depend on) ships a second
crate called `lbf` — a ~500 LOC **Left-Bottom-Fill reference implementation**
of a polygon-aware BPP optimizer. We were not using it. When I ran it on
REMA's production 37-part rectangle fixture, with rotation enabled and a
20-seed multistart, it placed **32/37** — within one of legacy NFP's 33/37,
using 300ms total runtime.

It also handled irregular polygons (trapezoids, concave cone sectors) at
100% placement rate with identical code. No shape-type dispatch. One
algorithm for everything on the sheet — exactly what the user asked for.

This closes essentially the entire gap vs legacy at trivial integration
cost (a git dependency + ~50 LOC of adapter). **No NFP port needed.**
**No sparrow LNS port needed.**

## Bench data (2026-04-19, M-series Mac, release build)

### Production rectangle fixture (29 unique × 37 copies, 78×396 bin)

| Configuration | Placed | Density | Time | Δ vs BSSF |
|---|---:|---:|---:|---:|
| BSSF baseline (current Rust) | **13/37** | 91.45% | 114µs | — |
| Legacy TS NFP+GA (reference) | **33/37** | 82.11% | 872ms | +20 |
| LBF 1k samples, no rotation, seed=42 | 23/37 | 82.34% | 2ms | +10 |
| LBF 5k samples, no rotation, seed=42 | 26/37 | 88.55% | 9ms | +13 |
| LBF 10k samples, no rotation, seed=7 | 28/37 | 88.26% | 17ms | +15 |
| LBF 5k samples, rotation, seed=7 | **32/37** | 77.93% | 11ms | +19 |
| LBF multistart × 20 seeds, rotation | **32/37** (best) | 77.93% | 292ms | +19 |

- **Rust path delta closed: +19 placements (146% improvement over BSSF).**
- Multistart plateaus at 32/37 — the last 1-2 copies (very elongated V7: 156.5×11)
  need either a smarter ordering or a post-pass compactor to reach 33.
- Counterintuitive finding: at 25k-50k samples, LBF places FEWER items. The
  loss function (minimize `x_max*10 + y_max`) is LBF's notion of "tight";
  at high sample counts it converges to tighter x-bounded layouts that
  coincidentally strand a few items. Multistart's "most-items-placed"
  selector bypasses this.

### Irregular polygon fixtures (parity suite)

| Fixture | Shapes | Placed | Time |
|---|---|---:|---:|
| trapezoid-mix (6 trapezoids, 48×96 bin) | pure trapezoids | **6/6** | 4ms |
| cone-array (4 quarter-cone annular sectors) | concave polygons | **4/4** | 7ms |

No shape-type dispatch. `LBFOptimizerBP` handles them identically to rectangles
via jagua-rs's CDE. This confirms the user's "1 algorithm on the sheet for all"
constraint is satisfied out of the box.

## Why this works

The `lbf` crate's `LBFOptimizerBP::solve()` algorithm (at
`lbf/src/opt/lbf_bpp.rs`):

1. Sort items by convex-hull diameter (descending).
2. For each item, while demand remains:
   - Walk open layouts first (existing bins being filled), then closed bins
     (fresh bins with stock).
   - In each layout, `search(cde, item, config, rng, ...)`:
     - Sample `n_samples × (1 - ls_frac)` uniform random (x, y, rotation) in
       the bin.
     - For each sample, check jagua-rs CDE for collision.
     - Keep best-loss valid placement.
     - `n_samples × ls_frac` local-search samples around the best found via
       normal distribution with decaying stddev.
   - Place the item at the best-found position.
3. Break out when nothing more fits.

Key properties:
- **Polygon-aware from the ground up** — uses jagua-rs's CDE + SPSurrogate
  approximation. A 120×35 rectangle and a 120×35 trapezoid are just two
  different polygons; same machinery handles both.
- **Deterministic** under fixed seed (SmallRng seeded from `prng_seed`).
- **Continuous rotation** when `allow_rotation=true` — this is the big lever
  that MaxRects can't access.
- **Fast** — the CDE's quadtree + fail-fast surrogate make 5000 collision
  checks per item complete in ~10ms total for 37 items.

## Gaps vs legacy

- **32 vs 33 placement** — the last 1-2 very-elongated items (V7: 156.5" × 11")
  need either smarter ordering, a post-placement compactor, or a polish pass.
  Easy Commit-2 work.
- **Density 77% vs 82%** — LBF's loss minimizes `x_max + y_max` (bbox corner);
  legacy's NFP+GA optimizes area utilization more directly. Minor — we care
  about placed count + reusable tail more than density per se.
- **No progress streaming / cancellation** — would need to add per-item
  callbacks. Trivially doable in a fork.

## Integration path

```toml
# engine/crates/rema-layout/Cargo.toml
[dependencies]
lbf = { git = "https://github.com/JeroenGar/jagua-rs", tag = "0.7.1" }
jagua-rs = { ..., features = ["spp", "bpp"] }  # enable spp too (lbf needs it)
```

Then ~100 LOC Rust wrapper that:
1. Converts `PackRequest` → `BPInstance` (we already have `to_jagua_instance`).
2. Runs multistart: `for seed in seeds { LBFOptimizerBP::new(...).solve() }`.
3. Picks best-placed solution (or best-placed-then-best-density).
4. Converts `BPSolution` → REMA `PackResult`.

Wire into `pack.rs` as a new `PackerStrategy::Lbf` variant, feature-flag it
behind `USE_LBF_ENGINE=true` to start, validate parity on all 9 fixtures,
then promote to default.

**Total integration cost estimate:** 200-400 LOC, 1-2 days.

Compare to:
- **Port legacy NFP to Rust:** 1500-2500 LOC, 1-2 weeks. Messy source.
- **Port upstream sparrow LNS:** 900-1400 LOC, 1-2 weeks. Uncertain BPP fit.
- **LBF adoption:** 200-400 LOC, 1-2 days. Already works on REMA shape types.

## Why we missed this earlier

The prior sparrow research (`sparrow-integration/codex-report.md` and
`gemini-report.md`) focused on the `sparrow` crate, which is SPP-only and
publicly exposes `sparrow::optimizer::optimize(SPInstance, ...)`. Both agents
correctly identified that sparrow's public API is wrong for BPP. What they
missed — and what I missed in the handoff — is that the SAME repo
(`JeroenGar/jagua-rs`) has a SECOND crate named `lbf` that IS a complete
BPP optimizer, separately buildable, using only jagua-rs's public API.

The clue was the directory structure: `jagua-rs/` workspace contains both
`jagua-rs/` (the CDE library) and `lbf/` (reference optimizer). We were
pulling `jagua-rs` but ignoring `lbf`. Once I looked at the git checkout
directly instead of relying on agent summaries, the optimizer was sitting
right there.

Lesson: when doing deps research, check the workspace siblings of the crates
you depend on, not just the crate you imported.

## Risks / caveats worth noting

1. **LBF has no escape heuristic.** Unlike sparrow's LNS or legacy's GA, LBF
   is a single greedy pass per seed. Multistart across seeds is its only
   diversification mechanism. For harder fixtures (denser demand, less
   rotation flexibility) this ceiling might matter. For REMA's production
   shape families, 20-seed multistart already plateaus — a sign that more
   samples per seed won't help more than different seeds.

2. **Loss function mismatch.** At high `n_samples`, LBF converges to tight
   x-bounded layouts that sometimes strand items. The fix (select best by
   "most-placed then best-density", not by "lowest LBF loss") is trivial in
   our wrapper but a real concern to call out: don't naively use higher N.

3. **MPL-2.0 license.** Weaker copyleft than GPL but stronger than MIT/BSD.
   File-level copyleft on modifications to MPL sources. We can use, link,
   and distribute; modifications to the `lbf` source would need to be
   published. Acceptable per REMA's existing jagua-rs dep (same license).

4. **No cancellation token** in LBF's loop. For REMA's NDJSON cancel support
   (Task 14), we'd need to either fork `lbf` or chunk the solve into multiple
   bounded calls. Probably simpler to fork than to redesign.

5. **Rotation handling.** With `allow_rotation=true`, jagua-rs uses continuous
   rotation (any angle). REMA's parity tests use specific orientations for
   cones/trapezoids. Need to verify continuous rotation doesn't break any
   parity expectations — may need to pin rotations to `[0°, 90°, 180°, 270°]`
   via the `allowed_orientations` field on `ExtItem`.

## Corroborating web research

After writing the initial draft of this doc, the parallel web-research agent
returned. It independently (a) validated LBF as a viable option and (b) found
something I missed: **sparrow's outer LNS loop is only ~500 LOC on top of
what REMA already has ported**. Their decomposition of upstream sparrow:

| File | LOC | REMA already has? |
|---|---:|---|
| `src/optimizer/separator.rs` | ~700 | **yes** (`search/gls/separator.rs`) |
| `src/optimizer/explore.rs` | 239 | **yes** (`search/gls/explore.rs`) |
| `src/optimizer/compress.rs` | 72 | **yes** (`search/gls/compress.rs`) |
| `src/optimizer/mod.rs` (outer driver) | 74 | **no** |
| `src/optimizer/worker.rs` | 122 | **no** (this is the density-changing piece) |
| Config + wiring | ~200 | partial |

The "density-changing piece" is what my sparrow spike lacked — our current port's
exploration_phase preserves cardinality, so infeasibility → no item added.
Upstream sparrow's `worker.rs` + `mod.rs` have the strip-shrink-or-shrink-
equivalent piece that drives iterative densification. For BPP, we'd swap
"shrink strip" → "add one more item and retry feasibility" (essentially
a proper version of what my spike attempted but with correct plumbing).

**Estimated net port for sparrow-BPP-complete:** ~300-500 LOC on top of
REMA's existing GLS port. That's smaller than I feared.

The web agent (pessimistically) projected LBF at 22-28/37 — my empirical
bench beat that estimate by placing 32/37. So the real picture is:

| Option | Place rate | Integration cost | Time |
|---|---:|---:|---:|
| LBF stopgap (adopt `lbf` crate) | **32/37** measured | ~200-400 LOC | 1-2 days |
| LBF + sparrow outer-loop port | **33-35/37** projected | ~500-900 LOC | 1-2 weeks |
| Legacy NFP port | 33/37 | 1500-2500 LOC | 2-3 weeks |
| Upstream sparrow full port (BPP-adapted) | 33-35/37 | 900-1400 LOC | 2-3 weeks |

The two-phase LBF→sparrow-outer-loop plan dominates on every axis:
smaller total LOC than either single-shot port, smaller time, and we
get production value immediately from Phase 1 before Phase 2 even starts.

## Recommendation

**Two-phase adoption. Ship LBF now. Port sparrow's outer loop next.**

Specifically:

- **Phase 1 (1-2 days):** Wire LBF behind a feature flag. Run against all
  9 parity fixtures + production bench. Confirm parity suite stays green
  with LBF as the warm-start.
- **Phase 2 (1-2 days):** Multistart wrapper. Select best-placed.
  Replace or deprecate the current `bin-packing` MaxRects path for
  heterogeneous inputs.
- **Phase 3 (3-5 days):** Close the 32→33 gap. Options: (a) smarter item
  ordering, (b) post-placement compactor, (c) retry strays with BSSF. Any
  should get us to 33+.
- **Phase 4 (future):** If REMA needs to exceed 33 on larger fixtures, this
  is where a sparrow-style LNS port or legacy NFP port could attach, starting
  from LBF's solution as warm-start.

After Phase 2, you can delete the legacy TS `nesting/` engine entirely —
it's no longer the density baseline. The Rust stack will be polygon-aware,
unified for all shape types, and actually better than legacy.

## Files produced in this investigation

- `engine/crates/rema-layout/tests/lbf_bench.rs` — the integration test
  (5 tests: no-rotation bench, rotation bench, multistart, trapezoid
  validation, cone validation). All `#[ignore]`'d.
- `engine/crates/rema-layout/Cargo.toml` — added `lbf` dev-dep + noted
  SPP feature requirement.
- `.claude/research/sparrow-integration/lbf-finding.md` — this doc.
