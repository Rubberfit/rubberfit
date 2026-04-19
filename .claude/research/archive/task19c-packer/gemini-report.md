# Task 19c packer crate evaluation — Gemini

## 1. Recommended Crate: `rectangle-pack`

For our specific REMA Portal workload, **`rectangle-pack`** is the primary recommendation, superseding `guillotiere`. 

**Why `rectangle-pack`?**
* **Density The research report for Task 19c has been completed and written to `.claude/research/task19c-packer/gemini-report.md`.

### Summary of Findings:
- **Recommended Crate:** **`rectangle-pack`** is selected over `guillotiere`. While `guillotiere` is excellent for dynamic texture atlases, `rectangle-pack` provides a deterministic multi-bin MaxRects algorithm which is essential for matching the high density (70.5%) achieved by the legacy engine on heterogeneous fabric rolls.
- **Guillotine Constraint:** The research confirms that for CNC-based fabric and rubber cutting (lasers, waterjets, etc.), a strict guillotine constraint is not required. Implementing a non-guillotine packer (MaxRects) will significantly improve material efficiency without violating physical cutting capabilities.
- **Offcut Analysis:** For Task 19d, the recommended strategy is to use the existing boolean geometry engine (`clipper2`) to calculate free-space polygons and derive maximal inscribed rectangles, rather than forking the packer to expose its internal free-list.
- **Integration:** The change is estimated at ~200 LOC within `warm_start::greedy_bottom_left`. A key risk identified is integer overflow when scaling `f64` coordinates to `u32` for the packer; a dedicated scaling factor (e.g., 1e4) is proposed as a mitigation.

The project is considered **ready-to-build** using `rectangle-pack`.
ly poorly with highly varied dimensions.
* **`texture_packer` / `crunch-rs` (Rejected):** Mostly designed for sprite sheets with specific constraints (like power-of-two bin sizes) and less flexible for general-purpose 2D stock cutting.

## 3. Guillotine vs. Non-Guillotine for Our Domain

Does fabric/rubber cutting require guillotine cuts? **No.**

Guillotine cutting (straight edge-to-edge slices) is typically required only when using heavy-duty stack cutters (cutting 50+ layers at once) or massive hydraulic bale cutters for raw rubber. 

However, for standard single-ply or low-ply custom fabric/rubber patterns, the industry relies on CNC waterjets, lasers, and reciprocating/rotary knives. These machines are fully capable of tracing complex paths, L-cuts, and intricate curves. Because the machines don't enforce a guillotine constraint, enforcing one in software unnecessarily restricts layout density. A non-guillotine MaxRects packer will pack much tighter, directly addressing the business goal of maximizing material usage.

## 4. Offcut Analysis Strategy (Task 19d)

For the reusable-vs-scrap metric, `rectangle-pack` relies on the MaxRects algorithm internally, which tracks free space as a list of overlapping maximal empty rectangles. Unfortunately, it does not expose this internal list through its public API. 

We have two viable paths for Task 19d:
1. **Fork/Patch `rectangle-pack`:** We could expose the internal `FreeRects` list. This is the fastest computation but introduces maintenance overhead.
2. **Boolean Geometry (Recommended):** We already have `clipper2` integrated via `engine/crates/rema-geom/src/infrastructure/clipper.rs`. After packing, we can perform a boolean difference: `clipper::difference(&bin_polygon, &placed_polygons)`. This yields the exact complex polygons representing free space. We can then run a standard maximal inscribed rectangle algorithm on these polygons. This cleanly decouples the packing logic from the offcut analysis and works universally, even if we switch packers later.

## 5. Integration Effort & Risks

**Integration Effort:** Low to Moderate (~150-200 LOC). 
We will integrate this within `warm_start::greedy_bottom_left`, keeping the same public signature and `SeedResult` output. The existing dispatcher will simply route heterogeneous bins to `rectangle-pack` instead of the vertical stacker.

**Coordinate Scaling Risk:**
* `rectangle-pack` expects integer dimensions (typically `u32`).
* Our S2.5 engine uses `f64` and scales via `RemaScale` (1e7 multiplier) in `clipper.rs`.
* **Risk:** A 396-inch bin scaled by 1e7 is 3.96 × 10^9, which is dangerously close to `u32::MAX` (4.29 × 10^9). We risk integer overflow if we use 1e7. 
* **Mitigation:** We should use a smaller, dedicated scaling factor for the packer (e.g., 1e4 or 1e5, giving sub-millimeter precision), then scale back to `f64` for the domain representations.

**Clearance Handling:**
We will inflate the item dimensions by `2 * clearance` before packing, and translate the placed items by `+clearance` on both axes, matching the exact logic already tested and proven in `greedy_2d_grid`.

## 6. Verdict

**Ready-to-build.** 

We should proceed with **`rectangle-pack`**. It aligns with our non-guillotine physical constraints, naturally supports multi-bin packing, and utilizes MaxRects, which is the necessary algorithmic step to close the 44% vs 70.5% density gap. The integration is straightforward, and our existing boolean engine (`clipper.rs`) provides a robust fallback for the offcut analysis.