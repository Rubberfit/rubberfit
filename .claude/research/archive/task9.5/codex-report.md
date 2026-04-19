# Task 9.5 Codex Report

Verdict: APPROVE for Claude to ship fixes.

## Item #1

### 1. Port vs sparrow upstream

I diffed sparrow upstream [`/tmp/sparrow-research/sparrow/src/eval/specialized_jaguars_pipeline.rs:27-89`] against our port [`engine/crates/rema-layout/src/infrastructure/search/gls/specialized_pipeline.rs:40-146`].

Result: no behavioral delta in the collision logic. The only real changes are comments, import paths, dropped SIMD branches, and the downgraded end-of-function assertion. The pole prepass, bit-reversed edge pass, and containment loop are intact. This was not introduced by Task 4’s port.

### 2. The suspected containment branch is not the bug

I traced the known reproducer `overflow_counted_when_bin_too_small` and the first concrete mismatch:

- sampled item: `pk=PItemKey(1v15)`
- extra hazard in custom only: `PlacedItem(pk=PItemKey(2v17), dt.translation=(5.104145, 7.3748126))`
- sampled shape bbox: `Rect { x_min: -0.033320427, y_min: 0.24320579, x_max: 10.09168, y_max: 5.368206 }`

Key finding: the extra `PlacedItem` is already present immediately after the pole prepass at [`specialized_pipeline.rs:52-69`]. It is not inserted by the containment loop at [`specialized_pipeline.rs:100-128`].

That matches jagua’s own semantics:

- `detect_containment_collision` only fires on bbox `Surrounding` / `Enclosed`, not plain `Intersecting` [`cd_engine.rs:231-255`].
- `collect_poly_collisions` does not early-return after `Exterior`; it still does edge + containment work [`cd_engine.rs:261-289`].

So the original “custom containment over-report” theory is false.

### 3. What is actually happening

The real divergence is:

- jagua default: `Exterior`
- custom: `Exterior + PlacedItem`

Runtime probe on the same mismatch:

- `root_edge=false`
- `vroot_edge=false`
- `root_pole=true`
- `shape_pole_inside_other=true`
- `other_pole_inside_shape=true`

Interpretation:

- the extra `PlacedItem` is a real overlap, not noise; poles from both shapes land inside the other polygon
- jagua default misses it because its polygon path only checks edge intersections plus full-containment fallback
- the custom path catches it because the pole prepass queries the root quadtree with circles before edge traversal

This is not a virtual-root issue either. Even full-root edge traversal missed the hazard.

### 4. Likely low-level jagua bug

The failing chain is inside jagua:

- `QTHazPartial::collides_with` is edge-only once the bbox passes [`qt_partial_hazard.rs:67-71`]
- `Edge::collides_with(Edge)` delegates to `edge_intersection` [`edge.rs:162-169`]
- `edge_intersection` returns `No` for parallel edges (`t_denom == 0.0 || u_denom == 0.0`) [`edge.rs:206-215`]

Inference: this geometry produces a real overlap that the edge-only path cannot see, likely because the relevant contact reduces to parallel / colinear overlap in these clearance-expanded, axis-aligned shapes. The containment fallback never runs because the bboxes merely intersect, they do not contain one another.

### 5. Why `Exterior` appears in both

`Exterior` is expected in both because jagua default inserts it immediately when the sampled bbox escapes the container [`cd_engine.rs:261-264`]. The extra `PlacedItem` only appears in custom because only custom performs the root-level pole probe [`specialized_pipeline.rs:52-69`]; jagua default never does.

### 6. Fix recommendation

Local fix I would ship:

- Extract a shared collector helper that does `root pole prepass + normal edge pass + containment fallback`.
- Use it in both:
  - the custom evaluator path
  - `CollisionTracker::recompute_loss_for_item` instead of raw `l.cde().collect_poly_collisions(...)` [`tracker.rs:88-103`]

Pros:

- fixes the real scoring bug, not just the debug assertion
- makes tracker state consistent with the evaluator
- preserves the useful pole-based true positive

Cons:

- intentionally diverges from current jagua default behavior
- needs an inline comment that this is a jagua false-negative workaround

Upstream issue to file:

- primary target: `jagua-rs`
- bug statement: `collect_poly_collisions` misses real polygon overlaps when edge detection fails but surrogate pole probes succeed
- minimal reproducer: 10x10 bin, 5 copies of 10x5 rect, clearance `0.125`, sample near the `pk=1v15` / `pk=2v17` geometry from `overflow_counted_when_bin_too_small`

Sparrow is implicated only because its custom path assumes parity with jagua default. The underlying bug is in jagua, not in our port.

## Item #3

I did not minimize a fresh reproducer here. I do sign off on the current profile override until upstream is fixed.

Why:

- Item #3 is a separate jagua quadtree-boundary bug at `qt_hazard.rs:111`, with the existing explanation in followups still holding
- the likely upstream patch remains either:
  - relax the zero-constricted-hazards assert, or
  - make `Rect::collides_with(&Edge)` boundary-inclusive at [`rect.rs:301-318`]
- that issue is debug-assert-only; Item #1 is a real behavioral miss in normal collection

## Bottom line

Do not “fix” Item #1 by deleting the extra custom `PlacedItem` or by changing the containment branch. The extra hazard is the correct result. The real bug is that jagua default under-reports, and our tracker currently inherits that undercount.
