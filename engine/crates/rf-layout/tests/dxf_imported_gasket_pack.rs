// engine/crates/rf-layout/tests/dxf_imported_gasket_pack.rs
//
// PR A Task 8 / spec §9: pack a DXF-imported ring gasket end-to-end
// and confirm jagua-rs preserves the inner bore on every placement.
// Builds the PolygonWithHoles the TS DXF lane produces for a ring
// (outer 32-vertex circle r=5, inner 32-vertex circle r=2), packs
// quantity 3 into a 36x12 bin, asserts each placement keeps the hole.

use rf_geom::domain::Point2D;
use rf_geom::{Polygon, PolygonWithHoles};
use rf_layout::application::pack::pack;
use rf_layout::domain::{Bin, BinKind, PackMode, PackRequest, Part, UnitSystem};

/// Build a regular polygon approximating a circle. Outer rings wind
/// CCW (positive trig direction); inner holes wind CW so jagua-rs
/// treats them as voids rather than as a second outer contour. Set
/// `wind_cw = true` for holes.
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
fn ring_gasket_packs_with_bore_preserved() {
    // Ring gasket: outer radius 5, inner bore radius 2, both 32-vertex
    // tessellation. Centered at (5, 5) so part-local coords are
    // non-negative — matches the convention in polygon_with_holes_pack.rs
    // and the TS DXF lane (parts get normalized to non-negative).
    let outer_pts = circle_polygon(5.0, 5.0, 5.0, 32, /* wind_cw */ false);
    let inner_pts = circle_polygon(5.0, 5.0, 2.0, 32, /* wind_cw */ true);

    let outer = Polygon::new(outer_pts).expect("outer ring polygon");
    let inner = Polygon::new(inner_pts).expect("inner bore polygon");
    let polygon = PolygonWithHoles::new(outer, vec![inner]);

    let part = Part {
        shape_id: "ring-gasket".into(),
        quantity: 3,
        polygon: Some(polygon),
        shape_spec: None,
        allow_rotation: true,
        grain_axis: None,
        difficulty: None,
        tag: None,
    };

    // Each ring has bbox 10x10. Three side-by-side requires width >= 30.
    // Use 36x12 to give jagua headroom for the LBF sampler.
    let request = PackRequest {
        bins: vec![Bin {
            bin_id: "b1".into(),
            width: 36.0,
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

    assert_eq!(
        result.placed_count, 3,
        "all 3 ring gaskets must place into the 36x12 bin"
    );
    assert_eq!(result.overflow_count, 0, "no overflow");
    assert_eq!(result.placements.len(), 3);

    for (i, placement) in result.placements.iter().enumerate() {
        assert_eq!(
            placement.polygon.holes().len(),
            1,
            "placement {i} must preserve the inner bore as exactly one hole"
        );
        assert!(
            !placement.polygon.is_simple(),
            "placement {i} must carry the hole through the pack pipeline"
        );
    }
}
