# Task 19d: Packer Choice Decision Memo

## 1. Root cause analysis

`rectangle-pack` is failing on the production 78x396 single-roll diagnostic for a structural reason, not a tuning reason. In `engine/crates/rema-layout/src/infrastructure/warm_start.rs`, the heterogeneous warm start expands every copy into a separate rectangle, scales dimensions to integers, and feeds them into `rectangle_pack::pack_rects`. That crate uses a rectpack2D-style free-section split tree. It is fast, but it is greedy in exactly the wrong way for this workload: each early placement carves a single remaining section into smaller sections, and those sections are not globally reconsidered, coalesced, or searched across alternate orderings.

The production fixture is dominated by several tall parts around 35.5-36.5 inches wide plus many smaller 11-16 inch fillers. That geometry wants a shelf-like answer: keep the tall G/H/T family compact, then use lower gaps for fillers. The current Rust path instead reaches a high single-bin area density while still placing only 12 of 37 parts. The measured single-bin result from `pack-cli` is about 90.4% density with 12 placed and 25 overflowed. That tells us the packer is not “leaving too much empty area”; it is creating the wrong shape of empty area. It burns the roll on a few large rectangles and leaves fragmented cavities that are area-rich but dimension-poor.

The insertion-order issue is real but not the main defect. The handoff already notes that re-sorting by descending area still fit the same 12 parts. So alphabetical order from `ffd_assign` is noise, not root cause. Rotation is also not the primary bottleneck. The current rectangle-pack integration effectively behaves as no-rotation, but on the measured 2-bin production run, turning rotation on or off barely changed the result: both runs placed all 37 and drove both rolls to roughly 396 inches occupied height. Rotation may recover a few placements in a stronger algorithm, but it does not explain a 21-part single-bin gap by itself.

What legacy is doing differently is broader than “better heuristic.” The mixed-shape legacy path is NFP-based and evaluates alternative orderings and rotation states. The vendored Fit placer minimizes compact footprint during placement, and the surrounding tooling already encodes business-aware preferences such as width-pair grouping, occupied-height minimization, and reusable-tail preservation. The cut-planner code is explicit about preferring more placed parts, fewer sheets, and lower occupied height. That matches the reference PDF, where legacy fits 33 parts into 388.5 inches of a 396-inch roll and preserves a meaningful full-width tail. Current Rust, by contrast, only survives the 2-bin run because the second roll absorbs what the first roll should have packed.

The final important constraint is architectural. `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs` calls `greedy_bottom_left()` as a fit probe while it is assigning items to bins, and then the same warm-start code path is used again to materialize the seed layout. That means a packer swap is not free. A more sophisticated solver can improve quality, but if it is dropped blindly into `greedy_bottom_left`, every FFD probe gets more expensive. The decision therefore has to optimize for two things at once: better heterogeneous placement quality and a migration path that keeps the probe path bounded.

## 2. Candidate packers (Rust)

### `binpack2d`

License: MIT. Maintenance: modest but acceptable; public repo activity is not current, but it is not abandonware either. API surface: relatively small, with MaxRects and Guillotine implementations that look much closer to a conventional rectangle packer replacement than to a research solver. Rotation support is not obvious in the public docs/API, so I would treat 90-degree rotation as absent or at least non-obvious until verified in code.

Expected quality versus `rectangle-pack`: better, but not enough by itself to assume parity with legacy. MaxRects keeps a richer free-rectangle set than a single split tree, so it should fragment less aggressively on this shelf-like workload. That should move the single-bin result out of the current 12-part failure mode. The downside is that a bare crate swap still does not give REMA legacy’s broader search behavior. I would expect a direct adapter to land somewhere in the low-to-mid 20s on the 78x396 diagnostic, with upper-20s possible only if REMA adds a small multi-ordering wrapper around it.

### `bin_packing`

License: not yet verified from accessible primary-source material in this environment, so this is a gating risk. Maintenance: very young, apparently active, and the docs surface is much broader than the other Rust-native options. API surface: this is the most interesting candidate because it exposes multiple families of rectangular packers, including MaxRects, Skyline, and a guillotine beam search, plus per-item rotation control and metrics-oriented output. That is much closer to “try several plausible layout strategies and keep the best,” which is exactly what this workload needs.

Expected quality versus `rectangle-pack`: highest upside among Rust crates surveyed. It is the only candidate here that plausibly closes most of the single-bin gap without forcing a port of the legacy NFP stack. On REMA’s workload, the useful difference is not one magic heuristic; it is algorithm breadth plus a small amount of deterministic multi-start. If legal review confirms the license and the crate metadata is clean, this is the best crate-level shot at moving the single-bin result into the high 20s or low 30s.

### `crunch`

License: `MIT OR Apache-2.0`. Maintenance: small project, moderate repo activity, straightforward scope. API surface: simple rectangle bin packing with rotation support and collision maps. This is attractive if the goal is a compact dependency with obvious 90-degree rotation semantics and minimal adapter code.

Expected quality versus `rectangle-pack`: probably somewhat better, but still limited. `crunch` looks like a stronger atlas-style packer than `rectangle-pack`, yet it still does not obviously offer the multi-strategy search that legacy benefits from. I would view it as a lightweight improvement path for rotation-sensitive cases, not as the likely answer to a 12-versus-33 single-bin gap.

### `cut-optimizer-2d`

License: `MIT OR Apache-2.0`. Maintenance: older and quieter than the leading crate choices. API surface: much more domain-aligned than texture-atlas crates. It understands cut pieces, optional rotation, and optimization-oriented outputs. That makes it conceptually closer to REMA’s business problem, and the `can_rotate` model lines up with current shape metadata.

Expected quality versus `rectangle-pack`: likely better than generic atlas allocators, but with more uncertainty. The upside is that it is solving a sheet-cutting problem rather than a GPU-atlas problem. The downside is age, probable runtime cost, and less confidence that it will slot neatly into the current warm-start/probe architecture. This is a credible second-tier option if REMA wants a domain-specific crate and accepts slower iteration.

### `guillotiere`

License: `MIT OR Apache-2.0`. Maintenance: healthy. API surface: polished, but aimed at dynamic texture atlas allocation. That is the wrong objective function for this problem. Texture atlases care about fast incremental allocation and reasonable occupancy, not about preserving reusable full-width tails or recovering from bad early shelves in a long roll.

Expected quality versus `rectangle-pack`: not promising. It may be more robust as an allocator, but it is not designed around cut-planning business metrics, and its likely strengths are orthogonal to REMA’s failure mode. I would not spend engineering time here.

### `gdrr-2bp`

License: GPL-3.0. Maintenance: academic/reference value only. API surface and algorithmic focus are interesting because it explicitly tackles 2D bin packing with rotation and leftovers. That “leftovers” focus is exactly the business signal REMA cares about.

Expected quality versus `rectangle-pack`: potentially strong as a reference, but irrelevant as a dependency because GPL-3.0 is a hard stop for this codebase. Read it for ideas; do not ship it.

### `packingsolver`

License: MIT. Maintenance: serious project, but C++, not Rust. API surface: broad and powerful, including leftovers, defects, unloading constraints, and multiple problem classes. If the question were purely “what solver family is closest to the business objective,” this would rank near the top.

Expected quality versus `rectangle-pack`: likely much stronger. The issue is scope. Pulling a C++ solver through FFI into the Rust warm-start path is a very different project than swapping a Rust crate. It increases build complexity, operational risk, and debugging cost. It is a reference point for what “good” can look like, not the right next step for Task 19d.

### Hand-written MaxRects BSSF

License: no dependency risk. Maintenance: all on REMA. API surface: exactly what we choose to build. In theory, this is attractive because it preserves full control and keeps the Rust binary self-contained.

Expected quality versus `rectangle-pack`: too uncertain to justify right now. The prior attempt only moved the single-bin diagnostic from 12 to 13 parts. Even if that implementation had a subtle bug, the broader lesson still stands: a bare BSSF implementation is not a legacy replacement. To be competitive, REMA would still need rotation handling, multiple candidate orderings, probably at least one shelf-aware wrapper, and continued maintenance of a nuanced packing subsystem. That is not a 250-LOC story anymore.

## 3. Recommendation

Primary pick: adopt `bin_packing`, but only if license and repository due diligence check out immediately. It is the only Rust-native candidate with enough algorithm breadth to make the business case credible. REMA’s problem is not that `rectangle-pack` chose the wrong sort order; it is that the current warm start lacks alternate layout families. `bin_packing` gives REMA a realistic path to test MaxRects, Skyline, and guillotine-beam variants under one adapter and pick the best result deterministically.

The trade-off is clear. REMA accepts slightly more integration complexity and some runtime growth in exchange for a real chance to recover reusable tails and Fab Score without porting the full legacy NFP stack. What REMA should not accept is dropping the richest search mode into every `ffd_assign` probe. The right integration is a split design: bounded deterministic heuristics for probes, richer multi-strategy evaluation for final seed materialization.

Ranked alternatives:

1. `bin_packing`, contingent on verified license and healthy crate metadata.
2. `binpack2d` plus a thin local wrapper that tries a few deterministic orderings and keeps the best result.
3. `cut-optimizer-2d` if REMA wants a more domain-specific sheet-cutting crate and can tolerate more uncertainty and runtime.
4. Port the legacy NFP approach to Rust if business requires something much closer to 33/37 single-bin and crate options underperform.
5. `crunch` as a lightweight fallback, mainly if dependency simplicity matters more than upside.
6. `guillotiere` only if the problem were dynamic atlas allocation, which it is not.
7. `gdrr-2bp` and `packingsolver` as references only.
8. Hand-written MaxRects BSSF only if dependency policy blocks every viable crate and REMA is willing to own a real packing subsystem long-term.

If the `bin_packing` license cannot be cleared quickly, the practical implementation recommendation becomes `binpack2d` plus a small deterministic wrapper. That is the safest path with acceptable upside.

## 4. Expected improvement

For the recommended path, I would not promise legacy parity on day one. I would predict a single-bin result around 28-31 parts on the 78x396 diagnostic, with 30 as the most honest point estimate. That is materially better than the current 12 and close enough to change the 2-bin behavior from “both rolls filled to 396” to “first roll absorbs more of the filler set, second roll retains a real tail.” Getting all the way to legacy’s 33 probably still needs one more business-aware wrapper, likely a light width-pair or occupied-height preference on top of the crate output.

On the 2-bin production case, the likely business win is not piece count, because Rust already places all 37. The win is remnant shape. Today’s measured Rust output effectively uses the full height of both rolls. With a stronger heterogeneous packer, I would expect roll 2 to preserve on the order of 90-125 inches of tail in the benchmark case, versus the current near-zero tail and versus legacy’s 125.63 inches. That would bring reusable offcut materially closer to the PDF/legacy outcome.

Fab Score should move with it. Current Rust is at 46/100 and legacy is at 52/100. My expected range for the recommended crate path is roughly 50-53, with 51 as the point estimate. That assumes better reusable-area detection downstream because the packer produces a cleaner tail, not because scoring changes. If REMA only swaps crates and does no wrapper work, the score lift will likely land at the low end of that range.

## 5. Migration plan

The migration should replace only the heterogeneous rectangle-pack branch in `warm_start.rs`. Keep `greedy_2d_grid` for homogeneous bins and keep the vertical-stack fallback. The new adapter should preserve the existing contract: same input shape list, same normalized coordinates on output, same deterministic `instance_index` reassignment and stable ordering of placed rectangles.

The critical implementation choice is to separate probe behavior from final-layout behavior. `ffd_assign()` currently uses `greedy_bottom_left()` as a fit oracle. If the recommended packer is invoked in its richest mode on every probe, FFD runtime will balloon. The careful design is:

1. Add a fast heterogeneous probe mode with one deterministic algorithm family and a strict runtime/branch cap.
2. Add a richer final-layout mode that can evaluate several candidate heuristics and return the best compact result.
3. Memoize probe results by bin dimensions, clearance, and a normalized multiset of `(shape_id, quantity)` so repeated FFD checks do not recompute identical states.

That preserves the architecture while letting REMA spend compute where it matters: once per final seeded layout, not on every intermediate bin-fit question.

Parity risk is manageable because `tests/packing/parity/parity.test.ts` does not pin exact coordinates. It checks placed counts, overflow counts, and per-bin efficiency bands. That is the right acceptance shape for a packer swap. A careful rollout should therefore be:

1. Implement the new heterogeneous adapter behind a feature flag or config toggle.
2. Run the parity suite and the production bench for single-bin and 2-bin cases.
3. Promote only if placed count stays at least parity-safe and business metrics improve on the production benchmark.

If `bin_packing` fails due diligence, take the same migration plan and point it at `binpack2d` plus a wrapper instead of stalling on a risky dependency.

## 6. Scope

For the recommended crate path, the honest scope is moderate, not trivial. A careful engineer should budget roughly 350-550 lines of Rust changes for the adapter, deterministic candidate evaluation, probe/final split, memoization, and bench-driven hardening. Wall-clock time is about 2-3 focused engineering days, plus however long legal review takes to clear the dependency.

If REMA falls back to `binpack2d`, the code volume is similar, because the wrapper logic becomes more important as the crate itself is narrower. If REMA instead decides the business target is “match legacy as closely as possible,” then the next honest step is a Rust port of the legacy NFP-based approach. That is no longer a crate swap. It is likely a 1500-2500 LOC project and more realistically 2-3 weeks once rotation search, placement policy, and validation are included.

The short version is: do not spend another cycle trying to rescue `rectangle-pack`, and do not romanticize a tiny hand-written MaxRects patch. The business gap is large enough that REMA either needs a broader rectangular packing crate now, or a deliberate port of the legacy algorithm later.
