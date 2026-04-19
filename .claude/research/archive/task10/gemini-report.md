# Task 10 — FFD bin assignment: design report

Scope: design-only review for `engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs`. No source edits. Absolute paths throughout.

Files consulted:

- `engine/crates/rema-layout/src/application/pack.rs` — per-bin loop
- `engine/crates/rema-layout/src/infrastructure/warm_start.rs` — single-bin seeder
- `engine/crates/rema-layout/src/infrastructure/search/mod.rs` — `OptimizerConfig`, `optimize()`
- `engine/crates/rema-layout/src/domain/{request,result,errors}.rs` — `Bin`, `Part`, `PackError`
- `engine/crates/rema-layout/tests/fixtures/*.json` — shape/aspect distribution
- `engine/crates/rema-layout/src/infrastructure/search/gls/{compress,separator,explore}.rs` — deviation-block style

Handoff correction: `Bin.priority` is `Option<i32>`, not `Option<u32>` (`domain/request.rs:30-32`). Every proposal below respects that signedness.

---

## 1. Module placement

Parent plan path `infrastructure/search/assignment/ffd.rs` is correct.

- **Same layer as `warm_start`.** Both are deterministic pre-search heuristics that produce candidate placements. `application/pack.rs:24-115` is already close to pure orchestration; keep it that way.
- **Under `search/` rather than a sibling `infrastructure/assignment/`.** FFD output feeds directly into `search::optimize` (`search/mod.rs:91-135`). A sibling directory creates two warm-start-shaped modules answering to `pack.rs`, which gets confusing when Task 12's cross-bin coordinator lands.
- **Not inside `application::pack`.** `application/mod.rs` re-exports only `pack`; burying a nontrivial heuristic there breaks the existing application/infrastructure seam.
- **Not a new crate.** Under 300 lines of domain glue — `rema-layout` owns every type involved.
- **Room to grow.** `assignment/` leaves space for `bfd.rs`, `shelf.rs`, `bin_selection.rs`. Make `assignment/mod.rs` a one-liner `pub mod ffd;` for now.

```
infrastructure/
├── warm_start.rs               # unchanged
└── search/
    ├── assignment/
    │   ├── mod.rs              # pub mod ffd;
    │   └── ffd.rs              # Task 10
    ├── gls/
    └── mod.rs                  # pub mod assignment; (otherwise unchanged)
```

---

## 2. FFD variant — "area-decreasing with longest-edge secondary"

Fixture inventory (`engine/crates/rema-layout/tests/fixtures/`):

| Fixture | Parts (bbox w × h) | Aspect |
|---|---|---|
| `single-rect.json` | 1× (24×12) | 2.0 wide |
| `multi-rect-same-size.json` | 6× (10×5) | 2.0 wide |
| `rect-grid.json` | 20× (6×6) | square |
| `overflow.json` | 6× (20×20) | square |
| `multi-sheet-remnant.json` | 15× (10×10), 2 bins | square |
| `mixed-rect-circle.json` | 3× (10×5) + 3× (8×8) | mixed |
| `trapezoid-mix.json` | 2× (10×4), 2× (8×5), 2× (8×3) | wide |
| `circle-grid.json` | 12× (6×6) bbox | square |
| `cone-array.json` | 4× (8×8) bbox | square |

Observations: all bins are 48×96 fresh or 48×48/48×20 remnant (confirms handoff's "tall stock"). Parts span square → 2:1 wide. Nothing is extremely skinny (>5:1). No fixture depends on aspect-aware bucketing.

The real FFD failure mode is tied-area items reordering nondeterministically. A compound key fixes both the heuristic and determinism:

- **Primary:** bbox area, descending.
- **Secondary:** `max(w, h)` descending — keeps skinny rectangles ahead of same-area near-squares, which pays off on tall 48×96 stock.
- **Tertiary:** `shape_id` ascending — deterministic fallback.
- **Quaternary:** instance ordinal ascending within a `Part.quantity` expansion.

Rejected:

- **Pure longest-edge.** Weaker than area on mostly-square inventories (circle-grid, cone-array).
- **Aspect-aware bin pools.** Fixture set has one bin per aspect class; operators stream parts onto whatever stock is available. Adds machinery for a problem that isn't expressed.
- **Hybrid buckets.** Revisit once telemetry exists.

---

## 3. Integration with `warm_start`

`warm_start::greedy_bottom_left(bin, items, clearance)` (`warm_start.rs:33-76`) stacks `Part`s vertically in list order, processes `part.quantity` copies of each (`warm_start.rs:51`), and reports unplaced quantity as `overflow`.

Recommendation: **FFD wraps `greedy_bottom_left` as a per-bin orchestrator**. Do not duplicate the packing math.

Shape:

1. Expand `items` into per-instance units (`Vec<FfdItem>`, one per `quantity`).
2. Sort units by the key chain from §2.
3. For each unit, walk the ordered bin list (§6) and call `greedy_bottom_left(bin, &[unit_as_single_quantity_part], clearance)`. Accept the first bin where the unit places.
4. Per-bin, aggregate accepted placements into a `SeedResult`.

Quantity handling falls out naturally: units from the same `Part` have identical primary/secondary keys and stay contiguous, but each is placed per-unit so spillover is precise.

Rejecting "replace `greedy_bottom_left` entirely" — it would delete a tested primitive (`warm_start.rs:104-170`) that Task 12's cross-bin coordinator may still want as a per-bin building block.

Cost: O(units × bins) `greedy_bottom_left` invocations. Fixture sizes (≤20 units, ≤2 bins) make this trivial. Add caching later if profiling demands.

---

## 4. API shape

```rust
// engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs
use crate::domain::{Bin, Part, PackError};
use crate::infrastructure::warm_start::SeedResult;

#[derive(Clone, Debug)]
pub struct FfdAssignment {
    /// One SeedResult per input bin, in input order. Bins with no
    /// placements carry an empty SeedResult.
    pub per_bin: Vec<SeedResult>,
    /// Items that fit no bin — per-shape breakdown, not a single total.
    pub overflow: Vec<(String, u32)>,
}

pub fn ffd_assign(
    bins: &[Bin],
    items: &[Part],
    clearance: f64,
) -> Result<FfdAssignment, PackError>;
```

Why:

- `per_bin: Vec<SeedResult>` is exactly what `pack.rs:33-44` already consumes.
- `overflow: Vec<(String, u32)>` preserves per-shape bookkeeping for logging, future UI waste reports, and Task 11+ requeue logic. The handoff's suggestion of a single `u32` total loses that.
- `PackError` is the right error type: only `InvalidPolygon` (via `greedy_bottom_left`) and empty-input guards (already in `pack.rs:8-13`).
- No `Default` impl — matches `OptimizerConfig` precedent (`search/mod.rs:60-64`).
- No `FfdConfig`. Sort order and bin order are hardcoded for Task 10, documented in the deviation block. Same stance as Task 7 (`compress.rs:33-38`).

---

## 5. Integration with `pack.rs`

Two options. Recommend **Option B: FFD replaces the per-bin `greedy_bottom_left` call; per-bin `search::optimize` call unchanged.**

**Option A** (FFD as alternate entry point, pack loop unchanged) — rejected. Keeps two warm-start paths alive and contradicts the parent plan.

**Option B** — call `ffd_assign` once before the bin loop; iterate bins zipped with `assignment.per_bin`.

Sketch vs. `pack.rs:19-44`:

```rust
let assignment = ffd::ffd_assign(&request.bins, &remaining, request.clearance)?;

for (bin, seed) in request.bins.iter().zip(assignment.per_bin.iter()) {
    if seed.placements.is_empty() && assignment.overflow.is_empty() { continue; }
    let config = search::OptimizerConfig { /* unchanged */ };
    let result = search::optimize(seed.clone(), config)?;
    // existing accounting at pack.rs:46-114 unchanged
}

// Overflow at pack.rs:117-118 reads assignment.overflow + any post-GLS drops
```

Benefits: one warm-start sweep, one GLS call per bin, `remaining` rebuild at `pack.rs:106-114` becomes unnecessary.

Edge case: `search::optimize` can drop placements (`search/mod.rs:472-489`). Task 18's overflow reconciliation needs to merge post-GLS drops with `assignment.overflow` — document in the commit, don't swallow it.

---

## 6. Bin ordering

1. **Explicit `bin.priority` descending when set.** `Bin.priority: Option<i32>` (`domain/request.rs:30-32`). `multi-sheet-remnant.json:4` sets `priority: 10` on the remnant — a real operator workflow (drain remnants first).
2. **Remnants before fresh when priority is unset.** Same intuition; use scrap before cutting fresh stock.
3. **Input order as final tie-breaker.** Deterministic; lets callers express any order by pre-sorting.

Rejected:

- **Capacity desc.** Fights the operator workflow and would break `multi-sheet-remnant.json`'s documented intent (remnant filled first, spill to fresh).
- **Input order only.** Ignores `priority`, which the fixture set exercises.

Implementation: stable sort (`slice::sort_by_key`) so equal-priority equal-kind bins retain input order.

---

## 7. Clearance handling

`greedy_bottom_left` currently binds `clearance` as `_clearance` (`warm_start.rs:36`) — real enforcement happens in `jagua_adapter::to_jagua_instance` (`search/mod.rs:93-97`), which inflates shapes for GLS.

Recommendation: **FFD is pass-through on clearance**. Do not precompute bbox-plus-clearance bounds.

- Inflating in FFD desynchronizes its fit-check from what `greedy_bottom_left` actually places.
- Simplest correct policy: trust `greedy_bottom_left`'s place/no-place verdict.
- When `greedy_bottom_left` eventually honors clearance (likely alongside Task 11's shelf packing), FFD inherits the behavior for free.

Document this in the deviation block so the next reader doesn't "fix" the unused parameter.

---

## 8. Determinism

FFD must be a pure function of `(bins, items, clearance)`. Sources of nondeterminism and mitigations:

1. **Ties on equal area.** Handled by the four-level sort key from §2 — no `HashMap` iteration in the sort path.
2. **FP area.** Use **bbox area**: matches "area-decreasing" literature and what `greedy_bottom_left` computes at `warm_start.rs:42-49`. Reserve shoelace polygon area (`pack.rs:143-151`) for later if concave shapes ever need it.
3. **Bin order.** Stable sort on `(−priority_or_default, kind_rank, input_index)`. Treat unset priority as `i32::MIN` so explicit zero still beats unset.
4. **Fit loop.** Iterates bins in order, returns on first success. No randomness.
5. **No RNG.** Do not import from `search::rng` or `rand`. Assert this in the deviation block.

Property under test: two `ffd_assign` calls on identical inputs return bitwise-identical `FfdAssignment` (serde round-trip equality).

---

## 9. Tests

Six unit tests at `#[cfg(test)] mod tests` inside `ffd.rs`. Style matches `warm_start.rs:104-170` and `pack.rs:180-317`.

1. **`naive_order_overflows_but_ffd_fits_all`** — parent plan's core case. Three items with bbox areas 200, 180, 100 and two bins where input-order spills one but area-desc fits all.
2. **`area_ties_break_on_longest_edge_then_shape_id`** — same-area parts (8×4, 4×8, 4×8 with different shape_id). Assert the documented tie-break chain is honored.
3. **`single_bin_collapses_to_warm_start_equivalent`** — one bin, five sorted parts. `ffd_assign(...).per_bin[0]` equals `greedy_bottom_left(bin, items_sorted, clearance)`.
4. **`overflow_when_nothing_fits_anywhere`** — 100×100 parts, two 10×10 bins. All per-bin placements empty; `overflow` carries full quantity.
5. **`quantity_greater_than_one_splits_across_bins`** — one part `quantity: 5`, 3 fit in bin 1, 2 in bin 2. Split = (3, 2), empty overflow.
6. **`bin_priority_places_remnant_before_fresh`** — remnant priority 10, fresh unset, input order reversed. Placements land on the remnant.

Bonus: `determinism_two_calls_identical_output` — serde-serialize both runs, assert equality. Catches stray `HashMap` iteration.

Do not add a clearance-inflation test — per §7 FFD does not interpret clearance.

---

## 10. Deviations block

Match the style of `compress.rs:1-38`, `separator.rs:1-37`, `explore.rs:1-33`:

```rust
// engine/crates/rema-layout/src/infrastructure/search/assignment/ffd.rs
//
// First-Fit-Decreasing bin assignment. Replaces `pack.rs`'s naive
// iterate-bins-in-input-order greedy spillover with an area-desc sort
// plus a first-fit bin sweep. Per-bin `SeedResult`s feed directly into
// `search::optimize`.
//
// Not a sparrow port — FFD is classic BPP literature (Johnson 1973,
// 2D extensions per Coffman et al. 2013). Per-bin inner call reuses
// the existing `warm_start::greedy_bottom_left` primitive.
//
// Deviations from canonical 2D-FFD:
//   1. Sort key is (-bbox_area, -max_edge, shape_id_asc,
//      instance_ordinal_asc). Pure area desc ties nondeterministically
//      on same-area items; the longer chain is a pure function of
//      input.
//   2. Fit-check calls `warm_start::greedy_bottom_left` per unit per
//      bin. Does NOT precompute clearance-inflated bboxes — the
//      authoritative clearance logic lives in `jagua_adapter` during
//      `search::optimize`. FFD forwards `clearance` verbatim.
//   3. Bin-order sort: priority desc (None ranked lowest), Remnant
//      before Fresh, input order as tie-breaker. Matches REMA operator
//      intuition (drain remnants before cutting fresh stock).
//   4. Pure function. No RNG, no clock, no globals. Determinism is a
//      typed-level invariant and is verified by the test module.
//   5. `FfdAssignment.overflow: Vec<(String, u32)>` preserves per-shape
//      breakdown instead of collapsing to a single total. Feeds
//      future waste-reporting UI and Task 11+ requeue logic.
//   6. Quantity expansion: a `Part` with `quantity=N` becomes N units
//      with identical primary/secondary keys and distinct
//      `instance_ordinal` tertiary keys. Preserves per-unit first-fit
//      without losing grouping for overflow bookkeeping.
//   7. No `FfdConfig`. Sort and bin order are hardcoded per the
//      deviations above. A config surface arrives when a second
//      caller (Task 11+ block-building, Task 12+ cross-bin repack)
//      wants different behavior.
```

---

## Loose ends

- **`Option<i32>` signedness.** Handoff said `Option<u32>`; actual is `Option<i32>`. Negative priorities are representable. Treat `None` as `i32::MIN` so any explicit value — including negative — sorts ahead of unset. Worth a one-line confirmation in the Task 10 commit.
- **Per-bin `overflow` semantics.** `pack.rs:100-103` notes that `search::optimize`'s `overflow` is bin-local. Under Option B that comment updates to "post-GLS drops merge with the FFD assignment overflow." Flag in the commit message.
- **`placed_by_shape` rebuild (`pack.rs:47-58`).** Under Option B this bookkeeping becomes redundant — placements-per-shape derive from the sum of `per_bin` SeedResults at the end.
- **Regression floor.** Rerun `overflow.json` (6× 20×20 on 48×48) post-Task-10. FFD is a no-op on homogeneous inputs, so the 2-item overflow should be unchanged — a useful invariant check.

End of report.
