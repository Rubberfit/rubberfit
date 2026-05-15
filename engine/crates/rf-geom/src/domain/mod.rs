// engine/crates/rf-geom/src/domain/mod.rs
pub mod errors;
pub mod point;
pub mod polygon;
pub mod polygon_with_holes;
pub mod rect;

pub use errors::GeomError;
pub use point::Point2D;
pub use polygon::Polygon;
pub use polygon_with_holes::PolygonWithHoles;
pub use rect::Rect;
