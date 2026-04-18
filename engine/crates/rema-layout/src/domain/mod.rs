// engine/crates/rema-layout/src/domain/mod.rs
pub mod request;

pub use request::{Bin, BinKind, GrainAxis, OperatorProfile, PackMode, PackRequest, Part, ShapeSpec, UnitSystem};
pub use request::{FAST_MS, BALANCED_MS, THOROUGH_MS};
