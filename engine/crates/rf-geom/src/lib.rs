// engine/crates/rf-geom/src/lib.rs
pub mod application;
pub mod domain;
pub mod infrastructure;

pub use domain::polygon::Polygon;
pub use domain::polygon_with_holes::PolygonWithHoles;
