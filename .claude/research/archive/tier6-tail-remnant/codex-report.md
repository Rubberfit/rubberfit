# Tier 6: Tail-remnant preservation

## Diagnosis

Task 19d fixed the single-bin packer choice, but it did not change the
multi-bin control flow that decides *which* roll absorbs the load. The
2-bin loss on the production fixture is not "BSSF cannot place the
parts"; it is "the current cross-bin logic never repacks an already-full
receiver bin from scratch."

That is visible in the current architecture:

- `ffd_assign` routes one unit at a time and asks `greedy_bottom_left` whether the
  receiver still fits the cumulative set. If the current receiver layout
  is saturated at ~396", the answer stays "no" even when a different
  layout of the same receiver items could have admitted more.
- The post-FFD operators in `cross_bin_swap.rs` use the same fixed-layout `bin_fits` oracle.
  `migrate` and `unload_lightest_bin` are therefore constrained by the *current*
  receiver arrangement, not by the best arrangement achievable for that
  receiver's item multiset.

That is exactly why the naive "move items off the last bin" approach
fails on this fixture. Roll-1 is already effectively full under the
current BSSF layout, so any operator that only probes "current receiver
plus one more item" will reject every candidate. Tier 6 therefore has to
be a **repack-the-whole-receiver** move, not a simple incremental fit
probe.

## 1. Algorithm choice

### Recommendation

Pick **D. Explicit consolidation operator**, implemented with **B's
post-pack re-seed** as its inner feasibility check.

In practical terms: add a new cross-bin operator that targets the
least-loaded non-empty roll, removes a bounded prefix of candidate items
from it, and repacks the receiver bin(s) from scratch with the augmented
item set. That is the smallest change that addresses the real failure
mode.

### Why D beats A/B/C/E

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| A. Multi-candidate seed at FFD time | Honest global search; can choose a better spill pattern up front | Multiplies `ffd_assign`'s already-expensive `unit x bin x probe` structure; invasive to the clean current FFD implementation | Reject for first implementation |
| B. Post-pack re-seed of last bin | Targets the actual failure mechanism; localized cost | By itself it is an idea, not an integration strategy; if done outside the operator framework it duplicates state/acceptance logic | Use as the inner primitive, not as the top-level design |
| C. Dual-packer fallback | Cheap to explain; easy to prototype | Re-running the whole job with a different single packer is too blunt; the issue is assignment + receiver-layout lock-in, not just "wrong global algorithm" | Reject |
| E. Next-fit-decreasing re-seeding | Simplifies routing conceptually | Effectively replaces Task 10 FFD and invalidates much more parity surface; scope blows past Tier 6's intended size | Reject |
| D. Explicit consolidation operator | Fits the existing cross-bin architecture; keeps FFD fast; can repack touched bins from scratch and stay transactional | Needs one new operator, one new score term, and a small warm-start strategy seam | Best choice |

### Concrete Tier 6 algorithm

The operator should be intentionally narrow in v1. The production
regression is a 2-bin, same-stock, no-overflow case, so the first
version should optimize exactly that family instead of pretending to be
a general k-bin metaheuristic.

Suggested algorithm:

1. Start from the current `FfdAssignment`.
2. Select the **tail candidate** as the least-loaded non-empty bin using
   the same used-area/density logic already present in
   `unload_lightest_bin`.
   On equal-stock 2-bin jobs, that is the business notion of "the roll
   we want to preserve."
3. Build movable source units from that bin's current placements, but do
   **not** sort by area alone. Sort primarily by `top_edge desc`
   (`y + height`), then `area asc`, then the existing deterministic keys.
   Tail height only improves when you remove shapes that touch the
   current top envelope.
4. Evaluate bounded prefixes of that ordered list, for example
   `k = 1..K_MAX` with `K_MAX = 6` or `8`. Keep the best improving
   candidate, do not stop at the first one; a 3-item move may unlock a
   much larger tail than a 1-item move.
5. For each prefix, repack the receiver from scratch with:
   - `MaxRectsBestShortSideFit` first, because it is today's fast stable
     baseline.
   - `MaxRectsBottomLeft` second, because it is cheap and directly biased
     toward lower occupied height.
   - `Auto` last, only as a fallback and only if time remains. `Auto` is
     useful as a search portfolio, but Task 19d already showed it is not
     the right default objective for the whole job.
6. Repack the reduced tail bin as well, normally with BSSF. This is
   required because removing a few copies can collapse the source bin's
   occupied height far more than the original layout suggests.
7. Accept the move only if every touched bin packs with `overflow == 0`
   and the new tail score is strictly better than the baseline.
8. Commit transactionally; otherwise return `None` and preserve the
   original assignment exactly.

This is the key architectural difference from today's `migrate`:
instead of asking "does the current receiver still fit?", Tier 6 asks
"if I repack the receiver's entire multiset, can it absorb these source
units while preserving or improving the business objective?"

### Complexity trade-off against current FFD

Current FFD in `ffd.rs` already pays for many warm-start probes. On a 37-part, 2-bin case it is
roughly `units x bins` calls into `greedy_bottom_left`. Any algorithm
that adds multiple routing candidates there will multiply the hottest
path in the whole search.

The explicit operator keeps that hot path unchanged. Its cost is instead
roughly:

`O(K_MAX x receivers x packer_portfolio_size)`

on *touched bins only*.

For the production regression, that means one source bin, one receiver
bin, and a bounded candidate list. That is far more predictable than A
or E, and it preserves the current clean separation:

- FFD remains the fast deterministic allocator.
- Tier 6 becomes a localized repair pass for the specific business
  failure mode.

## 2. Integration point

### Primary hook

The main hook should be a new operator in:

- `engine/crates/rema-layout/src/infrastructure/search/assignment/cross_bin_swap.rs`

That file already owns:

- the count-map state model (`assignment_from_state`, `state_from_assignment`)
- transactional cross-bin moves
- strict acceptance rules
- deterministic scan order

Tier 6 is conceptually "operator 4", not a new warm-start or a rewrite
of FFD.

### Scheduling point

Wire it into:

- `engine/crates/rema-layout/src/infrastructure/search/multi.rs`

specifically inside `apply_operator_ladder`, **after**
`unload_lightest_bin` and **before** `migrate`.

Recommended order:

1. `unload_lightest_bin`
2. `consolidate_tail_bin` (new Tier 6 operator)
3. `migrate`
4. `swap_two`

Reasoning:

- If a whole bin can be closed completely after a stronger repack, that
  is still the best outcome. Keeping unload first preserves that.
- If full unload fails, Tier 6 should run before generic migrate because
  generic migrate is still limited by the fixed-layout `bin_fits` probe
  in `cross_bin_swap.rs`.
- `swap_two` is the least targeted operator and should remain last.

### Where it should *not* hook

- Not in `warm_start.rs`: that layer only knows how to pack one bin for a fixed item set. It has
  no notion of least-loaded roll, closed bins, or tail objective.
- Not in `ffd.rs`: adding Tier 6 there would turn a targeted post-pass into an across-the-board
  routing cost multiplier.

### Supporting seam needed in warm_start

One supporting refactor is still justified in:

- `engine/crates/rema-layout/src/infrastructure/warm_start.rs`

Today `greedy_rectangle_pack` hardcodes BSSF for heterogeneous inputs.
Tier 6 needs a small strategy seam so the new operator can request BSSF,
BottomLeft, or Auto on demand. That is a utility change, not the hook
itself.

## 3. Scoring / acceptance

The current score in `cross_bin_swap.rs` is `(closed_bins, concentration)`.

That is **not enough** for Tier 6.

It already rewards concentration, and that helps somewhat, but it cannot
see the geometry that matters here:

- Two layouts with the same per-bin used area but different
  `occupiedHeight` get the same concentration score.
- A receiver/source repack that preserves the same area split but
  produces a much larger full-width tail would look like a tie.
- Task 19d's bench harness measures tail as
  `bin.height - occupiedHeight` in `tools/bench-production/bench.ts`.
  That is the exact metric the operator should optimize.

### Minimal score extension

Do **not** rewrite every existing operator around a geometry-heavy score.
The minimal change is an operator-local extension:

`TailScore = (closed_bins, tail_height, concentration)`

Where:

- `closed_bins` stays first. Emptying a bin is still strictly better than
  merely preserving a tail.
- `tail_height` is the full-width tail on the designated tail candidate:
  `bin.height - occupied_height`.
- `concentration` stays as the tertiary tie-break.

Acceptance rule:

- accept if `after.closed_bins > before.closed_bins`
- else accept if `after.tail_height > before.tail_height + eps`
- else accept if `after.tail_height == before.tail_height` and
  `after.concentration > before.concentration`
- otherwise reject

Use a small epsilon such as `0.01"` to avoid noise from scaled
round-tripping.

That is enough to make Tier 6 prefer "same bin count, much larger tail"
without dragging the rest of the operator ladder into unnecessary
materialized-layout scoring.

## 4. Runtime implications

The handoff's runtime concern is real. Task 19d already made the FFD
probe path materially heavier because `greedy_bottom_left` now calls the
bin packer on heterogeneous sets. The right response is not to make FFD
smarter everywhere; it is to make Tier 6 **bounded and late**.

### Proposed runtime bound

For 2-bin jobs, target **<= 1000 ms total wall-clock**.

Implementation rule:

- Tier 6 gets a local budget of `min(700 ms, remaining_global_budget)`.
- If remaining budget is below roughly `150 ms`, skip `Auto` and only
  try BSSF plus BottomLeft.
- If the request budget itself is below 1000 ms, Tier 6 must obey the
  existing global deadline in `multi.rs`;
  it is an optional repair pass, never a reason to exceed the caller's
  total budget.

### Why this is feasible

The production regression is only 2 bins. A bounded operator can stay
cheap if it obeys all of the following:

- trigger only when `n_bins == 2`
- trigger only when `overflow` is empty
- trigger only when both bins are non-empty
- trigger only when current tail is "collapsed" (for example `< 24"`)
- evaluate a small candidate frontier (`K_MAX <= 8`)
- use `Auto` only as a fallback, not on every candidate

That keeps Tier 6 in the "dozens of single-bin repacks" regime, not the
"rerun the whole assignment tree" regime.

There is also a clean degradation path: if the pass times out or no
candidate improves `TailScore`, the engine returns the exact current
assignment. Runtime risk is therefore bounded without any correctness
risk.

## 5. Parity risk

Yes, there is a real risk that a consolidation pass could drop a
placement if it commits a candidate based on counts alone and the final
repack cannot place every requested copy.

The guard is straightforward: **make the operator fully transactional
and materialized**.

Required safety rules:

1. Never mutate the live assignment in place. Work on a shadow state.
2. For every candidate, repack every touched bin with its final count
   map and require `overflow == 0`.
3. Preserve the global conservation invariant already encoded in
   `assert_per_shape_conservation`.
4. Before commit, verify:
   - `after_placed == before_placed`
   - `after_overflow == before_overflow`
5. On any packer error, timeout, or partial failure, return `Ok(None)`
   and keep the original assignment.

That is enough to protect the hard parity contract in
`tests/packing/parity/parity.test.ts`:
`rust.placedCount >= legacy.placedCount` and no overflow regression.

The subtler parity risk is not dropped placements, but distribution
drift: a tail-focused move can lower one bin's efficiency while raising
the other. The safest first version should therefore be scoped tightly
to the exact regression family:

- 2 equal fresh rolls
- no overflow
- collapsed tail

That minimizes the chance of waking up unrelated parity fixtures while
still fixing the production problem that motivated Tier 6.

## 6. Scope + commit strategy

### Realistic scope

If kept narrow, Tier 6 is still in the earlier estimate's range:

- new operator + helper scoring: `140-220 LOC`
- warm-start strategy seam: `40-90 LOC`
- operator-ladder hook + budget plumbing: `20-50 LOC`
- focused tests: `80-140 LOC`

Realistic total: **280-450 LOC**.

That is consistent with the earlier "250-500 LOC" estimate. It stops
being Tier 6-sized only if you broaden it into:

- a general multi-bin candidate router
- a new global FFD architecture
- unrestricted subset search
- rotation-aware search in the same commit

Do not do that.

### Commit strategy

Split it into **two commits**.

#### Commit 1: benchable minimal operator

Implement:

- warm-start strategy seam (`BSSF`, `BottomLeft`)
- `consolidate_tail_bin` for 2-bin jobs only
- operator-local `TailScore`
- hook in `apply_operator_ladder`
- focused Rust unit tests

This is the first tractable sub-step because it is immediately benchable
against the production CSV. It answers the only question that matters
first: "can whole-bin receiver repack recover a meaningful tail at all?"

#### Commit 2: fallback breadth and guardrails

Add:

- `Auto` fallback under a local deadline
- tighter runtime gating
- parity coverage for no-placement-drop behavior
- any candidate-order tuning discovered from the bench

### First sub-step I would actually build

Do **not** start with full Auto or with generalized k-bin search.

Start with:

- 2-bin only
- pick the lightest non-empty bin as source
- sort removable units by `top_edge desc, area asc`
- try prefixes up to `K_MAX = 6`
- receiver packer portfolio = `BSSF`, then `BottomLeft`
- commit only on strict `TailScore` improvement with no placement loss

If that already recovers most of the missing 125.63" tail, stop there.
If it does not, then add `Auto` as commit 2. That is the correct
bench-as-you-go sequence.

## Bottom line

Tier 6 should not be an FFD rewrite. It should be a **bounded,
transactional, post-FFD consolidation operator** that repacks the whole
receiver bin from scratch and scores the result on preserved full-width
tail, not just area concentration.

That is the smallest algorithmic change that directly addresses the Task
19d regression:

- it explains why naive migrate fails
- it fits the current multi-bin architecture
- it preserves parity safety
- it keeps runtime bounded
- and it leaves Tier 3 rotation and Tier 5 width-pairs where they
  belong: as optional future sub-techniques inside the same operator,
  not as standalone rewrites
