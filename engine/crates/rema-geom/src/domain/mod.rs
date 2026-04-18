// engine/crates/rema-geom/src/domain/mod.rs
pub mod errors;
pub mod point;
pub mod polygon;

pub use errors::GeomError;
pub use point::Point2D;
pub use polygon::Polygon;
