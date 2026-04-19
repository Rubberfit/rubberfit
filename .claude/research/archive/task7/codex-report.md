# Task 7 Second Opinion — Codex

Verdict: **APPROVE for Claude to draft the plan, but only with A. Reject B/C.**

## 1. Pick: A (no-op / omit compression)

- Upstream Algorithm 13 is not a generic "polish" pass. It is specifically: restore the prior solution, shrink the strip, run separator, keep the result only if it stays feasible (`compress.rs` L11, L57). Its config is entirely about that shrink loop and a dedicated separator setup (`config.rs` L40, L75). Sparrow also spends a dedicated 20% budget on this second phase because strip width can actually improve density (`consts.rs` L31, `bench.rs` L56, L97).
- Our BPP port explicitly deleted `change_strip_width` because bins are fixed-size (`separator.rs` L17). Our exploration phase likewise returns the first feasible layout immediately because per-bin density is fixed once the placed item set is fixed (`explore.rs` L89, L145, `layout.rs` L107).
- C does not survive contact with the current code. `Separator::move_items()` only acts on items with nonzero collision loss (`separator.rs` L421), and `separate()` exits as soon as total loss is zero (`separator.rs` L274). So "run another separator cycle with tighter params" on an already feasible layout is a no-op.
- B would be a new feature, not a faithful Task 7 port. It could change `occupied_width` / `occupied_height` at the API layer, but current search state/objective do not score intra-bin compactness. That is separate product work, not Algorithm 13.

## 2. Test impact

- The planned test "compress never worsens density" is vacuous if A wins. Identity trivially passes.
- Better replacement: test the seam, not density. For a fixed seed and feasible input, Task 8's optimize path should be observationally identical to exploration-only: same placements, same overflow, same feasibility, and no separate compression budget carved out. That catches two real regressions: keeping a dead 20% budget split, or accidentally mutating state in a nominally no-op phase.

## 3. Risks

- **BppObjective mismatch:** `BppObjective` scores only `total_overflow()` and `total_placed()` on a multi-bin `SearchState` (`objective.rs` L53, `state.rs` L34). Wrapping one `Layout` in a fake single-bin `SearchState` with zeroed others cannot see geometry-only "improvements." Do not consult `BppObjective` for Task 7 accept/reject.
- **Time budget waste:** the codebase already assumes an 80/20 explore/compress split (`explore.rs` L25, `terminator.rs` L8). `pack()` divides the user budget per bin first (`pack.rs` L16). If compression is meaningless, reserving 20% burns budget on every bin. Task 8 should reallocate that slice to exploration.
- **Determinism across the seam:** explore already consumes `sep.rng` in pool sampling and disruption (`explore.rs` L176, L302). Workers are seeded from the master RNG when the separator is built (`separator.rs` L212). A no-op compression phase should not touch RNG at all.
- **Worker reuse:** `move_items_multi()` reloads each worker from the master layout/CT every iteration (`separator.rs` L343). The real issue is config drift: workers capture `sample_config` at construction (`separator.rs` L197), and upstream uses a fresh separator for compression with different config (`config.rs` L62, L79, `bench.rs` L98). Reusing exploration workers for a differently-configured compression phase would be wrong — not a concern if A wins.

## 4. Config shape

- Recommended minimum: no `CompressionConfig` at all.
- Upstream's fields exist only to drive strip shrinking or a dedicated second separator. In our code, time budget already belongs on the outer optimizer/terminator, and A leaves no compression-specific behavior to tune.

## 5. Must-hold property

- For any feasible seed layout and fixed RNG seed, the Task 8 path with A must preserve the exact placement set and transforms, preserve feasibility, and leave the master RNG stream unchanged relative to exploration-only execution. Identity on density is too weak; identity on state and RNG is the real invariant.

## Bottom line

- Choose A.
- Do not add a geometry-compaction heuristic under Task 7.
- Do not consult `BppObjective` for this phase.
- Move the nominal 20% compression budget into exploration for Task 8.
