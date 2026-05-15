// engine/crates/rf-geom/src/domain/polygon_with_holes.rs
use crate::domain::errors::GeomError;
use crate::domain::point::Point2D;
use crate::domain::polygon::Polygon;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PolygonWithHoles {
    pub outer: Polygon,
    #[serde(default)]
    pub holes: Vec<Polygon>,
}

impl PolygonWithHoles {
    pub fn new(outer: Polygon, holes: Vec<Polygon>) -> Self {
        Self { outer, holes }
    }

    /// Lift a single-loop polygon (no holes). Used by callers that have
    /// not been updated for PR 0a, and by backward-compat deserializers.
    pub fn simple(outer: Polygon) -> Self {
        Self {
            outer,
            holes: Vec::new(),
        }
    }

    /// Lift from a raw vertex list. Convenience for callers that have
    /// `Vec<Point2D>` in hand.
    pub fn from_outer_points(points: Vec<Point2D>) -> Result<Self, GeomError> {
        Ok(Self::simple(Polygon::new(points)?))
    }

    /// Outer boundary minus the sum of hole areas. Holes are voids,
    /// so the part's physical area is outer − Σ holes.
    pub fn area(&self) -> f64 {
        let outer_area = self.outer.area();
        let holes_area: f64 = self.holes.iter().map(|h| h.area()).sum();
        outer_area - holes_area
    }

    /// Bbox of the outer boundary. Holes are contained, so they cannot
    /// extend the bbox beyond the outer's.
    pub fn bbox(&self) -> (Point2D, Point2D) {
        self.outer.bbox()
    }

    /// True when no holes are present. Lets the jagua adapter take the
    /// `ExtShape::SimplePolygon` path instead of `ExtShape::Polygon`.
    pub fn is_simple(&self) -> bool {
        self.holes.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unit_square() -> Polygon {
        Polygon::new(vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(10.0, 0.0),
            Point2D::new(10.0, 10.0),
            Point2D::new(0.0, 10.0),
        ])
        .unwrap()
    }

    fn inner_hole() -> Polygon {
        Polygon::new(vec![
            Point2D::new(3.0, 3.0),
            Point2D::new(7.0, 3.0),
            Point2D::new(7.0, 7.0),
            Point2D::new(3.0, 7.0),
        ])
        .unwrap()
    }

    #[test]
    fn area_subtracts_holes_from_outer() {
        let p = PolygonWithHoles::new(unit_square(), vec![inner_hole()]);
        // outer area = 100, hole area = 16, net = 84
        assert!((p.area() - 84.0).abs() < 1e-9);
    }

    #[test]
    fn simple_constructor_has_no_holes() {
        let p = PolygonWithHoles::simple(unit_square());
        assert!(p.is_simple());
        assert!((p.area() - 100.0).abs() < 1e-9);
    }

    #[test]
    fn bbox_matches_outer() {
        let p = PolygonWithHoles::new(unit_square(), vec![inner_hole()]);
        let (min, max) = p.bbox();
        assert_eq!(min, Point2D::new(0.0, 0.0));
        assert_eq!(max, Point2D::new(10.0, 10.0));
    }

    #[test]
    fn is_simple_flips_with_holes() {
        let no_holes = PolygonWithHoles::simple(unit_square());
        let with_hole = PolygonWithHoles::new(unit_square(), vec![inner_hole()]);
        assert!(no_holes.is_simple());
        assert!(!with_hole.is_simple());
    }

    #[test]
    fn serde_roundtrips_with_holes() {
        let p = PolygonWithHoles::new(unit_square(), vec![inner_hole()]);
        let json = serde_json::to_string(&p).unwrap();
        let back: PolygonWithHoles = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn serde_accepts_missing_holes_field() {
        // Backward-compat: serialized PolygonWithHoles where `holes` was
        // never written (e.g. created via PolygonWithHoles::simple) must
        // still deserialize. The `#[serde(default)]` on `holes` covers this.
        let json = r#"{"outer":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}"#;
        let p: PolygonWithHoles = serde_json::from_str(json).unwrap();
        assert!(p.is_simple());
    }
}
