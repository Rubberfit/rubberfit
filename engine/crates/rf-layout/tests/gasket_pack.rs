// engine/crates/rf-layout/tests/gasket_pack.rs
//
// PR C / spec §9 + §10 risks row 2: pack a parametric full-face
// gasket (outer + bore + 8 bolt holes) end-to-end to confirm
// jagua-rs preserves dense (1 + N) hole topology on every placement.
// Mirrors dxf_imported_gasket_pack.rs (PR A) which covers the simpler
// 1-hole ring case. Also adds an obround sanity test (single closed
// loop, no holes) so the gasket-cutting lane is fully exercised here
// independently of the TS adapter.

use rf_geom::domain::Point2D;
use rf_geom::{Polygon, PolygonWithHoles};
use rf_layout::application::pack::pack;
use rf_layout::domain::{Bin, BinKind, PackMode, PackRequest, Part, UnitSystem};

/// CCW outer / CW hole circle tessellation — matches the TS
/// `tessellateCircleAt` convention in `src/application/gasket/_circle.ts`.
fn circle_polygon(cx: f64, cy: f64, r: f64, segments: usize, wind_cw: bool) -> Vec<Point2D> {
    (0..segments)
        .map(|i| {
            let theta = (i as f64) * 2.0 * std::f64::consts::PI / (segments as f64);
            let sy = if wind_cw { -1.0 } else { 1.0 };
            Point2D::new(cx + r * theta.cos(), cy + r * sy * theta.sin())
        })
        .collect()
}

#[test]
fn full_face_gasket_packs_with_eight_bolt_holes_preserved() {
    // Full-face gasket: OD=16 (radius 8), bore radius 4, BCD radius 6,
    // 8 bolt holes radius 0.375. Centered at (8, 8) so part-local
    // coords are non-negative — mirrors the normalize-to-non-negative
    // convention used elsewhere in the test suite.
    let outer_pts = circle_polygon(8.0, 8.0, 8.0, 64, /* wind_cw */ false);
    let bore_pts = circle_polygon(8.0, 8.0, 4.0, 32, /* wind_cw */ true);

    let outer = Polygon::new(outer_pts).expect("outer disc polygon");
    let bore = Polygon::new(bore_pts).expect("bore polygon");

    let bcd_radius = 6.0_f64;
    let bolt_radius = 0.375_f64;
    let bolt_count = 8;
    let mut holes: Vec<Polygon> = vec![bore];
    for i in 0..bolt_count {
        let a = (i as f64) * 2.0 * std::f64::consts::PI / (bolt_count as f64);
        let cx = 8.0 + bcd_radius * a.cos();
        let cy = 8.0 + bcd_radius * a.sin();
        let bolt_pts = circle_polygon(cx, cy, bolt_radius, 16, /* wind_cw */ true);
        holes.push(Polygon::new(bolt_pts).expect("bolt-hole polygon"));
    }

    let polygon = PolygonWithHoles::new(outer, holes);

    let part = Part {
        shape_id: "full-face-gasket-od16-8bolt".into(),
        quantity: 2,
        polygon: Some(polygon),
        shape_spec: None,
        allow_rotation: true,
        grain_axis: None,
        difficulty: None,
        tag: None,
    };

    // 16x16 bbox per gasket; two side-by-side wants width >= 32.
    // 36x18 gives jagua headroom.
    let request = PackRequest {
        bins: vec![Bin {
            bin_id: "b1".into(),
            width: 36.0,
            height: 18.0,
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
        seed: Some(42),
        units: UnitSystem::Inch,
        cone_strategy: None,
        cone_packing_mode: None,
        scrap_strategy: None,
        offcut_extraction_strategy: None,
        use_warm_start: None,
    };

    let result = pack(request).expect("pack must succeed");

    assert_eq!(
        result.placed_count, 2,
        "both 8-bolt full-face gaskets must place into the 36x18 bin"
    );
    assert_eq!(result.overflow_count, 0, "no overflow");
    assert_eq!(result.placements.len(), 2);

    let expected_hole_count = 1 + bolt_count as usize; // bore + N bolts
    for (i, placement) in result.placements.iter().enumerate() {
        assert_eq!(
            placement.polygon.holes().len(),
            expected_hole_count,
            "placement {i} must preserve all {expected_hole_count} holes (bore + {bolt_count} bolts) through the pack pipeline"
        );
        assert!(
            !placement.polygon.is_simple(),
            "placement {i} carries holes — must not be classified as simple"
        );
    }
}

#[test]
fn obround_gasket_packs_with_no_holes() {
    // Obround gasket: length 6, width 3 — semicircle caps + straight
    // edges, no holes. Mirrors the buildObroundGasket TS output.
    let length = 6.0_f64;
    let width = 3.0_f64;
    let r = width / 2.0;
    let straight_half = length / 2.0 - r;
    let cap_segments = 16; // matches the TS minPerCap floor (even)
    let mut pts: Vec<Point2D> = Vec::new();
    // Center the gasket at (3, 1.5) so coords are non-negative.
    let cx = 3.0_f64;
    let cy = 1.5_f64;
    // Right cap CCW from -PI/2 to +PI/2
    for i in 0..=cap_segments {
        let a =
            -std::f64::consts::FRAC_PI_2 + (i as f64 / cap_segments as f64) * std::f64::consts::PI;
        pts.push(Point2D::new(
            cx + straight_half + r * a.cos(),
            cy + r * a.sin(),
        ));
    }
    // Left cap CCW from PI/2 to 3PI/2 (skip endpoints to avoid join dupes)
    for i in 1..cap_segments {
        let a =
            std::f64::consts::FRAC_PI_2 + (i as f64 / cap_segments as f64) * std::f64::consts::PI;
        pts.push(Point2D::new(
            cx - straight_half + r * a.cos(),
            cy + r * a.sin(),
        ));
    }

    let outer = Polygon::new(pts).expect("obround outer polygon");
    let polygon = PolygonWithHoles::new(outer, vec![]);

    let part = Part {
        shape_id: "obround-6x3".into(),
        quantity: 4,
        polygon: Some(polygon),
        shape_spec: None,
        allow_rotation: true,
        grain_axis: None,
        difficulty: None,
        tag: None,
    };

    let request = PackRequest {
        bins: vec![Bin {
            bin_id: "b1".into(),
            width: 24.0,
            height: 12.0,
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
        seed: Some(42),
        units: UnitSystem::Inch,
        cone_strategy: None,
        cone_packing_mode: None,
        scrap_strategy: None,
        offcut_extraction_strategy: None,
        use_warm_start: None,
    };

    let result = pack(request).expect("pack must succeed");

    assert_eq!(result.placed_count, 4, "all 4 obround gaskets must place");
    assert_eq!(result.overflow_count, 0, "no overflow");
    for placement in result.placements.iter() {
        assert!(
            placement.polygon.is_simple(),
            "obround placement must be simple (no holes)"
        );
        assert_eq!(placement.polygon.holes().len(), 0);
    }
}
