# Sparrow integration scoping — Codex

Direct upstream `sparrow` integration is not a drop-in fix for REMA. `sparrow` is a real Rust library, not just a CLI, but its public API is SPP-only (`SPInstance`/`SPSolution`) and its top-level optimizer is built around strip-width shrinking and strip compression. REMA is BPP: multiple fixed bins, bin-count and remnant preservation objectives, and a hot FFD probe loop that cannot afford a full iterative LNS pass. The useful conclusion is narrower: the algorithm family is relevant, but the crate boundary is not. If REMA wants Sparrow value, the practical path is to extend the BPP sparrow-derived code already living under `search/gls/`, not to wire `sparrow::optimizer::optimize()` straight into `greedy_bottom_left`.

## 1. Is sparrow applicable to REMA's BPP problem?

Applicable as an inner single-bin improver: yes. Applicable as the outer BPP solver: no.

That distinction matters. Upstream `sparrow` solves strip packing by repeatedly asking: “at the current strip width, can I remove all collisions and reach feasibility?” When it succeeds, it shrinks the strip again. When it fails, it disrupts the layout and retries. That maps cleanly to SPP, because width is the decision variable. REMA’s production problem is different: the 78×396 roll is fixed, the system has multiple rolls, and the business objective is not “minimize used width” in the abstract. It is “place more on earlier rolls, preserve a reusable tail, and minimize bin count.”

So the architecture is not useless, but it does not fit directly. For the 2-bin fixture, Sparrow can be adapted only at the per-bin layer: treat one roll as a fixed container, ask Sparrow-style search to find a denser layout for the full multiset assigned to that roll, and let REMA’s own outer loop decide which items belong on which roll. That is a warm-start or repack use, not a full BPP formulation.

The hard mismatch is the top-level optimizer. Upstream `sparrow::optimizer::optimize()` assumes strip shrink in exploration and compression. REMA cannot “shrink” a 396-inch roll; it needs a fixed-width feasibility or density-improvement routine. That means direct crate integration is not the right abstraction. The crate is not fundamentally incompatible with REMA’s geometry, but it is fundamentally incompatible with REMA’s outer objective unless REMA supplies the BPP orchestration itself.

Bottom line: Sparrow is not the BPP solver REMA can call wholesale. It is a strong single-container search engine whose ideas are relevant for REMA’s fixed-bin subproblems.

## 2. Sparrow + jagua-rs API surface

Upstream `sparrow` is both a binary and a library. Its `src/lib.rs` publicly exposes modules such as `optimizer`, `config`, and `util`, and `src/optimizer/mod.rs` exposes:

`pub fn optimize(instance: SPInstance, rng, sol_listener, terminator, expl_config, cmpr_config, initial_solution) -> SPSolution`

That answers the first sharpness question: Sparrow is not binary-only. But the second sharpness question is the blocker: the public surface is SPP-only. It consumes `jagua_rs::probs::spp::entities::SPInstance` and returns `SPSolution`. The CLI in `src/main.rs` simply wraps that library call by reading an SPP JSON instance or SPP solution JSON and exporting SPP output files.

By contrast, REMA already depends on `jagua-rs` 0.7.1 with feature `bpp`, and `jagua-rs` does expose BPP types: `BPInstance`, `BPProblem`, `BPSolution`, `probs::bpp::io::import_instance`, and `probs::bpp::io::export`. REMA already uses exactly that surface in `jagua_adapter.rs`. The important negative detail is that `jagua-rs` BPP solution import is still unimplemented. So there is no ready-made “load a BPP solution JSON and warm-start it” path comparable to Sparrow’s SPP flow.

That leaves three realistic integration choices:

1. Call upstream Sparrow directly: low code reuse at the adapter layer, but wrong problem type.
2. Fork Sparrow to `BPInstance`/`BPProblem`: possible, but now you own a nontrivial BPP port.
3. Continue using REMA’s existing internal port under `search/gls/`: highest code reuse, already BPP-shaped, already deterministic-hardened.

The third option is the practical one. REMA has already ported Sparrow’s separator/explore machinery into BPP form. Directly adding the upstream crate would duplicate algorithmic code REMA already owns while reintroducing the SPP/BPP mismatch.

## 3. Algorithm family

From the outside, a Sparrow run looks like this.

It starts from an initial solution. If none is provided, upstream builds one with `LBFBuilder`; if a solution is provided, it restores that exact placement state. Then it enters the exploration phase at the current strip width.

Inside exploration, the core workhorse is `Separator::separate()`. Separator keeps a collision tracker over the current layout and runs a penalty-weighted local search. Each iteration, multiple workers clone the same current solution. Each worker shuffles the currently colliding items, then for each still-colliding item it runs a sample-based placement search. Default sampling is not tiny: 50 container samples, 25 focused samples, and 3 coordinate descents per move. The worker moves the item to the best sampled transformation that does not worsen weighted collision loss. After all workers finish, the master keeps only the worker that achieved the lowest weighted loss.

The cost function is feasibility-first. Total collision loss is the real objective: zero means feasible. Weighted loss is the steering signal. After each iteration the tracker updates penalty weights, so the search increasingly emphasizes “stubborn” collisions. Termination at the separator level is controlled by two counters: no-improvement iterations and strikes. If a strike produces no substantial improvement, strikes accumulate; too many strikes ends the attempt.

Outside Separator, exploration is a destroy-repair loop. If total loss reaches zero, Sparrow stores the feasible solution and shrinks the strip by `shrink_step` (default 0.1%) and tries again. If it cannot reach feasibility, it inserts the least-infeasible solution into a pool sorted by loss, samples from that pool with a half-normal bias toward better solutions, rolls back to the sampled solution, and disrupts it by swapping two large items and moving practically-contained neighbors. Then separation starts again.

Compression is a second SPP-specific phase. Starting from the best feasible solution, Sparrow repeatedly shrinks the strip by a smaller ratio at a random split position and reruns separation. Successful shrinks are kept; failed shrinks cause decay of the shrink step or consume time until the minimum step is reached.

That is why direct use in REMA is awkward: the top-level control flow is built around strip shrink, not fixed-bin BPP.

## 4. Expected placement quality

Sparrow should absolutely beat the current 13-part ceiling. I would not promise that it closes the full 13→33 gap on the first integration.

The positive case is real. The current ceiling is caused by an axis-aligned rectangle heuristic family. Sparrow searches over irregular geometry with continuous rotation and a much broader neighborhood. That alone should remove the structural “13 and no more” barrier. Legacy proves there is at least a 33-part feasible layout on one 78×396 roll. So this is not an impossible instance; it is an algorithm-quality gap.

The reason to stay conservative is that REMA will not deploy Sparrow in the ideal academic setting. It will deploy it under fixed seeds, bounded budgets, deterministic parity expectations, and a BPP wrapper that still has to decide item-to-bin assignment. Also, REMA’s current sparrow-derived GLS only optimizes already-placed items. It never sees overflow items, so it cannot rescue a 13-part warm start into 33 by itself. A real gain only appears if Sparrow-style search is moved earlier, while the full requested multiset is still in play.

My honest expectation for a first safe integration is roughly 28-31 parts on the single-bin 78×396 diagnostic. That is enough to change the 2-bin behavior materially and is consistent with “strong irregular search, but not yet business-tuned BPP orchestration.” Hitting 33 is plausible, especially if continuous rotation is fully enabled and budget is generous, but I would not commit to it in the decision memo. If REMA ships a deterministic, budget-limited version with cautious rotation handling, I would expect low 30s at best, not a guaranteed legacy tie.

So the answer to the sharpness prompt is: Sparrow alone is likely strong enough to close most of the gap, but not strong enough to guarantee the full gap closes under REMA’s production constraints. If the business requirement is “must reliably match legacy’s 33 on day one,” a direct legacy-NFP port is still the straighter line.

## 5. Integration scope

Replacing the heterogeneous branch of `greedy_bottom_left` with direct upstream Sparrow is not a 300-LOC swap. It is closer to a 900-1400 LOC project if done correctly, and I would treat anything smaller as under-scoped.

Why that big? Because the current hot path is not a one-shot final packer. `ffd_assign` calls `greedy_bottom_left` repeatedly as a probe: per unit, per candidate bin, before final materialization. A full Sparrow pass is iterative, randomized, and budgeted. It is acceptable once or twice per touched bin. It is not acceptable inside the FFD oracle.

That forces a split design:

- Probe mode: keep a cheap deterministic oracle, likely today’s BSSF path.
- Final repack mode: run Sparrow-style search only when a full multiset for a bin is known.

The minimum viable integration that proves value is therefore narrower than “replace the heterogeneous branch.” It is:

1. Keep `bin-packing` BSSF as the FFD probe.
2. After FFD assignment, run a bounded Sparrow-style repack on the final item multiset for a selected bin, or only inside Tier 6 receiver repacks.
3. Measure single-bin placed count and 2-bin tail recovery.

That spike is maybe 400-700 LOC because REMA already has the BPP ported separator/explore code. Full replacement of the heterogeneous warm-start path is larger because it needs a clean probe/final split, budget plumbing, deterministic caching, extra tests, and probably a new “pack missing items” routine instead of today’s “optimize existing placements only.”

It also does not “play nice” with the existing GLS search as an additive second pass. The current search stack in `search/gls/` is already Sparrow-derived. Running upstream Sparrow after that is mostly duplicate budget burn. The real gap is earlier: before overflow is frozen. So the new work should replace or precede the current seed materialization for targeted bins, not sit after it as a second optimizer.

## 6. Risks and blockers

Determinism is the biggest blocker to direct upstream use. Sparrow uses fixed RNG seeds, so same-seed reproducibility on one machine is feasible. But upstream also uses rayon worker parallelism and floating-point-heavy comparisons. I would not promise bit-identical output across environments from the upstream crate. REMA’s internal BPP port already made determinism-focused choices that upstream Sparrow does not prioritize. For the parity suite, that is a meaningful difference.

Runtime is the second blocker. Sparrow degrades gracefully in the sense that it always returns the best solution it has seen so far. But quality degrades nonlinearly under tight budgets because the destroy-repair loop needs time to escape local minima. That is acceptable for one-shot final repacks with a 200-700 ms budget. It is a bad fit for the `ffd_assign` probe loop, where dozens of calls may happen on one request.

Rotation is not a fundamental contract blocker, but it is an integration blocker. REMA’s `SeedPlacement` contract already carries both `polygon` and `rotation_rad`, and `search/mod.rs` already replays and exports arbitrary rotations through jagua’s internal/external transforms. So the downstream shape contract is sound. The actual blocker is earlier: `warm_start.rs` currently materializes heterogeneous placements assuming no rotation, and REMA’s downstream parity coverage is not rotation-stress-tested for continuous angles. Sparrow’s continuous rotation is an upside only after REMA adds those tests.

One smaller API blocker: `jagua-rs` BPP solution import is still unimplemented. That does not stop an in-process integration, but it removes the easiest “serialize a BPP warm start and feed it back in” path.

## 7. Recommendation

Recommendation: no-go on direct upstream Sparrow crate integration as a drop-in replacement for `greedy_bottom_left` or as an FFD probe. Go on a scoped prove-value spike that uses the Sparrow algorithm family where it actually fits.

The right minimum viable integration is:

1. Keep the current deterministic BSSF probe in FFD.
2. Add a bounded Sparrow-style fixed-bin repack for final multiset materialization on selected bins only:
   - single-bin jobs, and
   - Tier 6 receiver repacks.
3. Reuse REMA’s existing BPP sparrow port under `search/gls/` rather than adopting upstream `sparrow::optimizer::optimize()` wholesale.
4. Success threshold: move the single-bin diagnostic from 13 into at least the high 20s, and recover a real tail on the 2-bin fixture without parity regressions.

Pros of this path: lower scope than a legacy NFP port, reuse of code REMA already owns, cleaner determinism story than upstream, and direct measurement against the business fixture.

Cons: it still does not guarantee 33/37 parity, and it does not eliminate the need for a strong BPP outer policy. If this spike stalls below roughly 28 parts, or if deterministic behavior under fixed seed is not good enough, stop. At that point the honest recommendation shifts: port or wrap the legacy NFP policy instead of forcing Sparrow into a shape it does not naturally fit.

So the final call is:

- `sparrow` as an upstream crate boundary: no.
- Sparrow’s search approach, via REMA’s existing BPP port and a targeted repack seam: yes.
- If the business bar is strict legacy parity, not “large improvement,” legacy NFP is still the safer endgame.
