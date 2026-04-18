// engine/crates/rema-geom/src/application/normalize.rs
use crate::domain::{GeomError, Point2D, Polygon};

/// Normalize a polygon to CCW winding with min-corner at (0, 0).
pub fn normalize_polygon(points: Vec<Point2D>) -> Result<Polygon, GeomError> {
    if points.len() < 3 {
        return Err(GeomError::PolygonTooFewVertices { count: points.len() });
    }
    let min_x = points.iter().map(|p| p.x).fold(f64::INFINITY, f64::min);
    let min_y = points.iter().map(|p| p.y).fold(f64::INFINITY, f64::min);
    let translated: Vec<Point2D> = points
        .iter()
        .map(|p| Point2D::new(p.x - min_x, p.y - min_y))
        .collect();

    let polygon = Polygon::new(translated)?;
    if polygon.signed_area() >= 0.0 {
        Ok(polygon)
    } else {
        let mut reversed: Vec<Point2D> = polygon.points().to_vec();
        reversed.reverse();
        Polygon::new(reversed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_to_origin() {
        let raw = vec![
            Point2D::new(5.0, 10.0),
            Point2D::new(8.0, 10.0),
            Point2D::new(8.0, 14.0),
            Point2D::new(5.0, 14.0),
        ];
        let p = normalize_polygon(raw).unwrap();
        let (min, _) = p.bbox();
        assert_eq!(min, Point2D::new(0.0, 0.0));
    }

    #[test]
    fn reverses_cw_to_ccw() {
        // CW in math coords: (0,0) → (0,1) → (1,1) → (1,0)
        let cw = vec![
            Point2D::new(0.0, 0.0),
            Point2D::new(0.0, 1.0),
            Point2D::new(1.0, 1.0),
            Point2D::new(1.0, 0.0),
        ];
        let p = normalize_polygon(cw).unwrap();
        assert!(p.signed_area() > 0.0, "normalized polygon must be CCW");
    }

    #[test]
    fn rejects_fewer_than_three_vertices() {
        let too_few = vec![Point2D::new(0.0, 0.0), Point2D::new(1.0, 0.0)];
        assert!(normalize_polygon(too_few).is_err());
    }
}
