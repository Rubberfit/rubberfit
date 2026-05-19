// engine/crates/rf-layout/tests/polygon_with_holes_fuzz.rs
//
// PR 0a Task 11 — property / fuzz pass on PolygonWithHoles invariants.
//
// Generates 100 random polygon-with-holes inputs from a single seeded
// xoshiro RNG (seed 42, so failures are reproducible) and asserts the
// five invariants the PR-0a contract has to maintain end-to-end:
//
//   1. area() == outer.area() − Σ holes[i].area()        (geometry)
//   2. each hole's bbox is contained in the outer's bbox  (precondition)
//   3. hole count is preserved through rf_layout::pack(...)
//   4. polygon area is preserved through rf_layout::pack(...)
//      (pack only translates + rotates → rigid motion → invariant area)
//   5. hole-less inputs pack via the ExtShape::SimplePolygon path
//      and stay simple in the resulting Placement.
//
// All inputs sit comfortably inside a 100×100 bin (parts cap at
// ~5" radius) so every iteration is expected to place.
//
// Generation strategy (keeps holes well-formed without needing a CDT):
//   - outer: regular n-gon (3 ≤ n ≤ 32) inscribed in radius r ∈ [1.5, 2.5]
//   - holes: 0..=6 axis-aligned small squares laid out on a grid in
//     the inner half of the outer's bbox. Cells are non-overlapping
//     by construction. Holes always have 4 vertices.
//
// The generator simplification (square holes) is fine: invariants 1, 3,
// 4 are properties of the area() formula, the pack pipeline, and rigid
// motion — none of them care about hole shape complexity.

use rand::{RngExt, SeedableRng};
use rand_xoshiro::Xoshiro256PlusPlus;
use rf_geom::domain::Point2D;
use rf_geom::{Polygon, PolygonWithHoles};
use rf_layout::application::pack::pack;
use rf_layout::domain::{Bin, BinKind, PackMode, PackRequest, Part, UnitSystem};

const FUZZ_ITERATIONS: usize = 100;
const HOLELESS_FRACTION: usize = 10; // iter % HOLELESS_FRACTION == 0 → no-holes input
const BIN_SIZE: f64 = 100.0;
const SEED: u64 = 42;

/// Build a regular n-gon outer inscribed in a circle of radius `r`,
/// centered at (r + 0.5, r + 0.5) so the part sits in the +x/+y
/// quadrant with a small margin off the bin's bottom-left corner.
fn build_outer(rng: &mut Xoshiro256PlusPlus, n: usize, r: f64) -> Polygon {
    let cx = r + 0.5;
    let cy = r + 0.5;
    // Random angular offset so identical-n polygons aren't bit-identical.
    let theta0: f64 = rng.random_range(0.0..std::f64::consts::TAU);
    let pts: Vec<Point2D> = (0..n)
        .map(|i| {
            let theta = theta0 + (i as f64) * std::f64::consts::TAU / (n as f64);
            Point2D::new(cx + r * theta.cos(), cy + r * theta.sin())
        })
        .collect();
    Polygon::new(pts).expect("outer polygon ≥3 vertices by construction")
}

/// Build up to `target_holes` axis-aligned square holes laid out on a
/// grid centered on the outer's bbox center. Cell side is small enough
/// that every hole stays strictly inside the outer's inscribed circle
/// (we use ≤ r·sin(π/n) as the safe inradius for a regular n-gon, then
/// take half that as the half-extent the grid can reach from center).
fn build_holes(
    rng: &mut Xoshiro256PlusPlus,
    target_holes: usize,
    outer_r: f64,
    outer_n: usize,
) -> Vec<Polygon> {
    if target_holes == 0 {
        return Vec::new();
    }

    // Inradius of a regular n-gon inscribed in circumradius outer_r:
    //   r_in = outer_r * cos(π/n).
    // Use a fraction of r_in for the grid half-extent so holes can never
    // poke outside the outer polygon, even for triangles.
    let inradius = outer_r * (std::f64::consts::PI / outer_n as f64).cos();
    let grid_half = inradius * 0.6;

    let cx = outer_r + 0.5;
    let cy = outer_r + 0.5;

    // Lay out up to 9 cells (3×3 grid); pick `target_holes` of them.
    // Each cell is (2·grid_half / 3) wide; holes are 60% of cell width.
    let cell = (2.0 * grid_half) / 3.0;
    let half_hole = cell * 0.30;

    let mut holes: Vec<Polygon> = Vec::with_capacity(target_holes);
    let mut placed = 0;
    // Walk grid in a fixed row-major order so generation is deterministic
    // for a given RNG state.
    for row in 0..3 {
        for col in 0..3 {
            if placed >= target_holes {
                break;
            }
            let hx = cx - grid_half + cell * (col as f64) + cell * 0.5;
            let hy = cy - grid_half + cell * (row as f64) + cell * 0.5;
            // Small random jitter inside the cell so consecutive holes
            // aren't perfectly axis-aligned identical squares.
            let jitter = cell * 0.05;
            let dx: f64 = rng.random_range(-jitter..jitter);
            let dy: f64 = rng.random_range(-jitter..jitter);
            let h = Polygon::new(vec![
                Point2D::new(hx + dx - half_hole, hy + dy - half_hole),
                Point2D::new(hx + dx + half_hole, hy + dy - half_hole),
                Point2D::new(hx + dx + half_hole, hy + dy + half_hole),
                Point2D::new(hx + dx - half_hole, hy + dy + half_hole),
            ])
            .expect("hole has 4 vertices");
            holes.push(h);
            placed += 1;
        }
    }
    holes
}

/// Build a PackRequest containing exactly one part, bin large enough
/// to guarantee placement.
fn single_part_request(part: Part) -> PackRequest {
    PackRequest {
        bins: vec![Bin {
            bin_id: "fuzz-bin".into(),
            width: BIN_SIZE,
            height: BIN_SIZE,
            kind: BinKind::Fresh,
            priority: None,
        }],
        clearance: 0.0,
        items: vec![part],
        operator_profile: None,
        mode: Some(PackMode::Fast),
        engine: None,
        time_budget_ms: Some(2_000),
        improvement_budget_ms: None,
        seed: Some(SEED),
        units: UnitSystem::Inch,
        cone_strategy: None,
        cone_packing_mode: None,
        scrap_strategy: None,
        offcut_extraction_strategy: None,
        use_warm_start: None,
    }
}

/// Invariant 2: every hole's bbox is contained in the outer's bbox.
fn assert_holes_inside_outer_bbox(pwh: &PolygonWithHoles, iter: usize) {
    let (outer_min, outer_max) = pwh.outer().bbox();
    for (i, hole) in pwh.holes().iter().enumerate() {
        let (hmin, hmax) = hole.bbox();
        assert!(
            hmin.x >= outer_min.x
                && hmin.y >= outer_min.y
                && hmax.x <= outer_max.x
                && hmax.y <= outer_max.y,
            "iter {iter} hole {i}: bbox ({:?}..{:?}) escapes outer bbox ({:?}..{:?})",
            hmin,
            hmax,
            outer_min,
            outer_max,
        );
    }
}

#[test]
fn polygon_with_holes_fuzz_100_iterations() {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(SEED);

    let mut placed_holed = 0_usize;
    let mut placed_simple = 0_usize;

    for iter in 0..FUZZ_ITERATIONS {
        // Outer: 3..=32 vertices, radius 1.5..=2.5 (so parts fit in
        // BIN_SIZE with massive slack).
        let outer_n: usize = rng.random_range(3..=32);
        let outer_r: f64 = rng.random_range(1.5..2.5);
        let outer = build_outer(&mut rng, outer_n, outer_r);

        // Holes: every 10th iteration is hole-less (invariant 5);
        // otherwise 1..=6 holes.
        let target_holes: usize = if iter % HOLELESS_FRACTION == 0 {
            0
        } else {
            rng.random_range(1..=6)
        };
        let holes = build_holes(&mut rng, target_holes, outer_r, outer_n);
        let actual_holes = holes.len();

        let pwh = PolygonWithHoles::new(outer.clone(), holes.clone());

        // ── Invariant 1: area conservation ───────────────────────────
        // Tolerance: 1e-6 matches the post-pack rigid-motion check;
        // trigonometric polygon-vertex generation + multi-polygon
        // shoelace accumulation can exceed 1e-9 (CodeRabbit PR 0a finding).
        let expected_area: f64 = outer.area() - holes.iter().map(|h| h.area()).sum::<f64>();
        let got_area = pwh.area();
        assert!(
            (got_area - expected_area).abs() < 1e-6,
            "iter {iter}: area mismatch (got {got_area}, expected {expected_area}, |Δ|={})",
            (got_area - expected_area).abs(),
        );

        // ── Invariant 2: hole bbox containment (precondition) ────────
        assert_holes_inside_outer_bbox(&pwh, iter);

        // Build the Part for the pack pipeline.
        let part = Part {
            shape_id: format!("fuzz-{iter}"),
            quantity: 1,
            polygon: Some(pwh.clone()),
            shape_spec: None,
            allow_rotation: false,
            grain_axis: None,
            difficulty: None,
            tag: None,
        };
        let input_area = pwh.area();
        let input_holes_len = pwh.holes().len();
        let req = single_part_request(part);

        let result = pack(req).unwrap_or_else(|e| panic!("iter {iter}: pack failed: {e:?}"));

        // Bin is 100×100, parts cap at ~5×5 — placement must succeed.
        assert_eq!(
            result.placed_count, 1,
            "iter {iter}: expected single placement, got placed={} overflow={}",
            result.placed_count, result.overflow_count,
        );
        let placement = &result.placements[0];

        // ── Invariant 3: hole count preserved through pack ───────────
        assert_eq!(
            placement.polygon.holes().len(),
            input_holes_len,
            "iter {iter}: pack dropped/added holes (in={}, out={})",
            input_holes_len,
            placement.polygon.holes().len(),
        );

        // ── Invariant 4: area preserved under rigid motion ───────────
        let out_area = placement.polygon.area();
        let area_delta = (out_area - input_area).abs();
        assert!(
            area_delta < 1e-6,
            "iter {iter}: area not preserved through pack (in={input_area}, out={out_area}, Δ={area_delta})",
        );

        // ── Invariant 5: hole-less inputs stay simple ────────────────
        if actual_holes == 0 {
            assert!(
                placement.polygon.is_simple(),
                "iter {iter}: hole-less input produced a non-simple placement (SimplePolygon path broken?)",
            );
            placed_simple += 1;
        } else {
            assert!(
                !placement.polygon.is_simple(),
                "iter {iter}: holed input produced a simple placement (lost {actual_holes} holes)",
            );
            placed_holed += 1;
        }
    }

    // Sanity: we expect ~10 hole-less iters (every 10th) and ~90 holed,
    // but build_holes can return 0 holes if target_holes was 0. Just
    // verify we exercised both code paths.
    assert!(
        placed_simple >= FUZZ_ITERATIONS / HOLELESS_FRACTION,
        "expected ≥{} hole-less iterations, got {placed_simple}",
        FUZZ_ITERATIONS / HOLELESS_FRACTION,
    );
    assert!(
        placed_holed > 0,
        "expected at least one holed iteration to exercise ExtShape::Polygon path",
    );
}
