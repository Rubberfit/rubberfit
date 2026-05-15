// engine/crates/rf-layout/tests/polygon_with_holes_pack.rs
//
// PR 0a end-to-end integration tests for the polygon-with-holes
// contract. Confirms hole topology flows through:
//   request DTO → jagua adapter → jagua-rs pack → result DTO
// without information loss, and that legacy single-loop requests
// still pack correctly via the serde backward-compat shim.

use rf_geom::domain::Point2D;
use rf_geom::{Polygon, PolygonWithHoles};
use rf_layout::application::pack::pack;
use rf_layout::domain::{Bin, BinKind, PackMode, PackRequest, Part, UnitSystem};

/// Build a `Part` representing a ring (annulus): outer circle of
/// radius `outer_r` centered at (outer_r, outer_r), with a concentric
/// inner circle of radius `inner_r`. Both tessellated to `segments`
/// vertices.
fn ring_part(outer_r: f64, inner_r: f64, segments: usize) -> Part {
    let outer_pts: Vec<Point2D> = (0..segments)
        .map(|i| {
            let theta = (i as f64) * 2.0 * std::f64::consts::PI / (segments as f64);
            Point2D::new(
                outer_r + outer_r * theta.cos(),
                outer_r + outer_r * theta.sin(),
            )
        })
        .collect();
    // Holes traverse in the OPPOSITE winding to the outer so jagua
    // treats them as voids rather than as a second outer contour.
    // Outer is CCW (positive trig direction); we wind the hole CW by
    // reversing the y-component of the trig term.
    let inner_pts: Vec<Point2D> = (0..segments)
        .map(|i| {
            let theta = (i as f64) * 2.0 * std::f64::consts::PI / (segments as f64);
            Point2D::new(
                outer_r + inner_r * theta.cos(),
                outer_r - inner_r * theta.sin(),
            )
        })
        .collect();

    let outer = Polygon::new(outer_pts).expect("outer ring polygon");
    let inner = Polygon::new(inner_pts).expect("inner ring polygon");

    Part {
        shape_id: "ring".into(),
        quantity: 1,
        polygon: Some(PolygonWithHoles::new(outer, vec![inner])),
        shape_spec: None,
        allow_rotation: false,
        grain_axis: None,
        difficulty: None,
        tag: None,
    }
}

fn ring_request(part: Part, bin_w: f64, bin_h: f64) -> PackRequest {
    PackRequest {
        bins: vec![Bin {
            bin_id: "b1".into(),
            width: bin_w,
            height: bin_h,
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
    }
}

#[test]
fn ring_packs_into_bin_with_hole_respected() {
    // 5" OD, 2" ID, 32-vertex tessellation. Packs on a 24x24 bin.
    let part = ring_part(5.0, 2.0, 32);
    let req = ring_request(part, 24.0, 24.0);
    let result = pack(req).expect("pack succeeds");

    assert_eq!(result.placed_count, 1, "ring places once");
    assert_eq!(result.overflow_count, 0, "no overflow");
    assert_eq!(result.placements.len(), 1);

    let placement = &result.placements[0];
    assert!(!placement.polygon.is_simple(), "placement carries the hole");
    assert_eq!(placement.polygon.holes().len(), 1);

    // Area: outer πR² − inner πr²; ≈ π(25 - 4) ≈ 65.97. Tessellated
    // 32-gon area is slightly less than the perfect circle area; allow
    // a 1.5-unit tolerance so this test isn't brittle to vertex count.
    let area = placement.polygon.area();
    let expected = std::f64::consts::PI * (25.0 - 4.0);
    assert!(
        (area - expected).abs() < 1.5,
        "ring area within tolerance ({} vs {})",
        area,
        expected
    );
}

/// Build a circle polygon as a `segments`-vertex regular polygon
/// inscribed in a circle of radius `r` centered at (cx, cy). Used
/// for the full-face gasket's bore + bolt holes.
fn circle_pts(cx: f64, cy: f64, r: f64, segs: usize) -> Vec<Point2D> {
    (0..segs)
        .map(|i| {
            let theta = (i as f64) * 2.0 * std::f64::consts::PI / (segs as f64);
            Point2D::new(cx + r * theta.cos(), cy + r * theta.sin())
        })
        .collect()
}

#[test]
fn full_face_gasket_with_eight_bolt_holes_packs_correctly() {
    // 16" square outer + 4" bore (centered) + 8 bolt holes (0.75" dia)
    // on a 12" bolt-circle diameter. Matches Codex v2 acceptance
    // criterion for high-hole-count gaskets.

    let outer = Polygon::new(vec![
        Point2D::new(0.0, 0.0),
        Point2D::new(16.0, 0.0),
        Point2D::new(16.0, 16.0),
        Point2D::new(0.0, 16.0),
    ])
    .expect("outer square");

    // Bore: 4" diameter (2" radius), centered at (8, 8), 32 vertices.
    let bore = Polygon::new(circle_pts(8.0, 8.0, 2.0, 32)).expect("bore");

    // 8 bolt holes: 0.75" diameter (0.375" radius), on a 12" BCD
    // (6" radius from center) at (8, 8). 16-vertex tessellation —
    // small holes don't need 32.
    let bcd_r = 6.0;
    let bolt_holes: Vec<Polygon> = (0..8)
        .map(|i| {
            let theta = (i as f64) * 2.0 * std::f64::consts::PI / 8.0;
            let cx = 8.0 + bcd_r * theta.cos();
            let cy = 8.0 + bcd_r * theta.sin();
            Polygon::new(circle_pts(cx, cy, 0.375, 16)).expect("bolt hole")
        })
        .collect();

    let mut holes = vec![bore];
    holes.extend(bolt_holes);

    let part = Part {
        shape_id: "full-face".into(),
        quantity: 1,
        polygon: Some(PolygonWithHoles::new(outer, holes)),
        shape_spec: None,
        allow_rotation: false,
        grain_axis: None,
        difficulty: None,
        tag: None,
    };

    let req = ring_request(part, 24.0, 24.0);
    let result = pack(req).expect("pack succeeds");

    assert_eq!(result.placed_count, 1, "gasket places once");
    let placement = &result.placements[0];
    assert_eq!(placement.polygon.holes().len(), 9, "1 bore + 8 bolt holes");

    // 256 (outer) - π * 4 (bore) - 8 * π * 0.140625 (bolt holes)
    //   = 256 - 12.566 - 3.534
    //   ≈ 239.9
    // Tessellated polygon areas run slightly below the true circle
    // area, so the placement area will be a touch HIGHER than the
    // perfect-circle figure (because the bolt-hole subtraction is
    // smaller in the tessellated version). 1.5-unit tolerance.
    let area = placement.polygon.area();
    let expected = 256.0 - std::f64::consts::PI * 4.0 - 8.0 * std::f64::consts::PI * 0.140625;
    assert!(
        (area - expected).abs() < 1.5,
        "gasket area within tolerance ({} vs {})",
        area,
        expected
    );
}

#[test]
fn legacy_single_loop_request_lifts_and_packs() {
    // Identical JSON to the FIXTURE constant in request.rs — flat
    // polygon array, no `outer`/`holes` keys. Must lift through the
    // serde compat shim (Task 2), pack via jagua's SimplePolygon path
    // (Task 5's branch), and emit a hole-less placement.
    let json = r#"{
        "bins":[{"binId":"b1","width":48,"height":96,"kind":"fresh"}],
        "clearance":0.125,
        "items":[{"shapeId":"rect-a","quantity":1,"polygon":[{"x":0,"y":0},{"x":24,"y":0},{"x":24,"y":12},{"x":0,"y":12}],"allowRotation":true}],
        "mode":"fast",
        "seed":42
    }"#;
    let req: PackRequest = serde_json::from_str(json).expect("legacy fixture parses");
    let part = &req.items[0];
    let pwh = part.polygon.as_ref().expect("legacy lifted");
    assert!(pwh.is_simple(), "no holes in legacy input");
    assert_eq!(pwh.outer().points().len(), 4);

    let result = pack(req).expect("legacy pack succeeds");
    assert_eq!(result.placed_count, 1);
    assert!(
        result.placements[0].polygon.is_simple(),
        "no holes emitted from legacy input"
    );
}
