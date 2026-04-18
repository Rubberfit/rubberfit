// engine/crates/rema-geom/src/infrastructure/clipper.rs
//
// Thin wrapper around the clipper2 crate. Exposes boolean / offset operations
// in domain types so the rest of the codebase never sees clipper2.
use clipper2::{
    difference as clipper_difference, inflate, union as clipper_union, EndType, FillRule,
    JoinType, Path, Paths, PointScaler,
};

use crate::domain::{Point2D, Polygon};

/// Custom point scaler. Clipper2 uses 64-bit integer coordinates internally;
/// we choose 1e7 as the multiplier so sub-micron geometry survives a round
/// trip without rounding error.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Hash)]
struct RemaScale;

impl PointScaler for RemaScale {
    const MULTIPLIER: f64 = 1e7;
}

/// Convert a domain `Polygon` into clipper2 `Paths` at 1e7 scale.
fn to_clipper(p: &Polygon) -> Paths<RemaScale> {
    let pts: Vec<(f64, f64)> = p.points().iter().map(|pt| (pt.x, pt.y)).collect();
    Paths::<RemaScale>::from(pts)
}

/// Convert a clipper2 `Paths` result (at 1e7 scale) back into domain `Polygon`s.
/// Empty paths are dropped; paths with fewer than 3 vertices are dropped.
fn from_clipper(paths: Paths<RemaScale>) -> Vec<Polygon> {
    paths
        .iter()
        .filter_map(|path: &Path<RemaScale>| {
            if path.len() < 3 {
                return None;
            }
            let pts: Vec<Point2D> = path.iter().map(|pt| Point2D::new(pt.x(), pt.y())).collect();
            Polygon::new(pts).ok()
        })
        .collect()
}

/// Boolean union of two polygons. Returns the resulting polygons.
pub fn union(a: &Polygon, b: &Polygon) -> Vec<Polygon> {
    let result = clipper_union::<RemaScale>(to_clipper(a), to_clipper(b), FillRule::NonZero)
        .unwrap_or_default();
    from_clipper(result)
}

/// Boolean difference: `a` minus every polygon in `b`.
pub fn difference(a: &Polygon, b: &[Polygon]) -> Vec<Polygon> {
    let subject = to_clipper(a);
    let mut clip: Paths<RemaScale> = Paths::default();
    for p in b {
        clip.push(to_clipper(p));
    }
    let result =
        clipper_difference::<RemaScale>(subject, clip, FillRule::NonZero).unwrap_or_default();
    from_clipper(result)
}

/// Polygon offset. Positive `delta` grows the polygon outward, negative shrinks it.
pub fn offset(p: &Polygon, delta: f64) -> Vec<Polygon> {
    let result = inflate::<RemaScale>(
        to_clipper(p),
        delta,
        JoinType::Miter,
        EndType::Polygon,
        2.0,
    );
    from_clipper(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(x: f64, y: f64, side: f64) -> Polygon {
        Polygon::new(vec![
            Point2D::new(x, y),
            Point2D::new(x + side, y),
            Point2D::new(x + side, y + side),
            Point2D::new(x, y + side),
        ])
        .unwrap()
    }

    #[test]
    fn union_of_disjoint_squares_yields_two_polygons() {
        let a = square(0.0, 0.0, 1.0);
        let b = square(5.0, 5.0, 1.0);
        let out = union(&a, &b);
        assert_eq!(out.len(), 2, "expected 2 disjoint polygons, got {}", out.len());
    }

    #[test]
    fn difference_carves_a_hole_shaped_result() {
        let outer = square(0.0, 0.0, 10.0);
        let inner = square(3.0, 3.0, 4.0);
        let out = difference(&outer, std::slice::from_ref(&inner));
        // Clipper2 returns the outer ring + hole ring with opposite winding;
        // the net (outer minus hole) is the sum of signed areas.
        let net_area: f64 = out.iter().map(|p| p.signed_area()).sum::<f64>().abs();
        assert!(
            (net_area - 84.0).abs() < 0.5,
            "expected area ~84, got {}",
            net_area
        );
    }

    #[test]
    fn offset_grows_outward() {
        let sq = square(0.0, 0.0, 10.0);
        let out = offset(&sq, 2.0);
        let total_area: f64 = out.iter().map(|p| p.area()).sum();
        assert!(
            total_area > 100.0,
            "expected grown area > 100, got {}",
            total_area
        );
    }
}
